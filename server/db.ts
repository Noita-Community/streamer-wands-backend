// sqlite storage. Strict about content: STRICT tables, foreign keys on, JSON validity checked,
// and every timestamp is an INTEGER holding unix milliseconds.
//
// Callers pass and receive plain values; nothing outside this file writes SQL.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { silentLogger, type Logger } from './log.ts';
import {
    SCHEMA_VERSION,
    migrate,
    type InsertableSnapshot,
    type SelectableSnapshot,
    type Snapshot,
} from './schema.ts';
import type { TwitchGrant } from './twitch.ts';

/** DDL migrations, applied in order. PRAGMA user_version records how many have run. */
const DDL: string[] = [
    `
    CREATE TABLE streamers (
        id              TEXT PRIMARY KEY,           -- Twitch user id, always a string
        login           TEXT UNIQUE,                -- Twitch login, lowercase; NULL until the user logs in to this app
        display_name    TEXT NOT NULL,              -- Twitch display name as last seen
        snapshot        TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),   -- canonical snapshot JSON
        schema_version  INTEGER CHECK ((snapshot IS NULL) = (schema_version IS NULL)),
        updated_at      INTEGER CHECK ((snapshot IS NULL) = (updated_at IS NULL)) -- unix ms of the last snapshot write
    ) STRICT;

    CREATE INDEX streamers_display_name ON streamers (display_name COLLATE NOCASE);

    CREATE TABLE twitch_grants (
        streamer_id        TEXT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
        access_token       TEXT NOT NULL,
        refresh_token      TEXT NOT NULL,
        expires_at         INTEGER NOT NULL,        -- unix ms
        scopes             TEXT NOT NULL,           -- space-separated; empty string when none
        granted_at         INTEGER NOT NULL,        -- unix ms
        last_validated_at  INTEGER,                 -- unix ms
        revoked_at         INTEGER                  -- unix ms
    ) STRICT;
    `,
];

export type Streamer = {
    id: string;
    login: string | null;
    display_name: string;
};

export type Db = ReturnType<typeof openDb>;

/** A unix-ms timestamp must be a safe non-negative integer; anything else is a bug in the caller. */
function assertUnixMs(value: number, what: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(
            `${what} must be unix milliseconds as an integer, got ${String(value)}`,
        );
    }
}

export function openDb(path: string, log: Logger = silentLogger) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const sql = new DatabaseSync(path);
    sql.exec('PRAGMA foreign_keys = ON');

    const { user_version } = sql.prepare('PRAGMA user_version').get() as { user_version: number };
    if (user_version > DDL.length) {
        throw new Error(
            `database is at DDL version ${user_version}, newer than this build (${DDL.length})`,
        );
    }
    for (let i = user_version; i < DDL.length; i++) {
        sql.exec('BEGIN');
        try {
            sql.exec(DDL[i]!);
            sql.exec(`PRAGMA user_version = ${i + 1}`);
            sql.exec('COMMIT');
        } catch (err) {
            sql.exec('ROLLBACK');
            throw err;
        }
        // Table changes are rare and irreversible; always worth a record.
        log.info({ message: 'database DDL applied', path, ddl_version: i + 1 });
    }
    log.info({ message: 'database open', path, ddl_version: DDL.length });

    const q = {
        byId: sql.prepare('SELECT id, login, display_name FROM streamers WHERE id = ?'),
        byLogin: sql.prepare('SELECT id, login, display_name FROM streamers WHERE login = ?'),
        byDisplayName: sql.prepare(
            `SELECT id, login, display_name FROM streamers
             WHERE display_name = ? COLLATE NOCASE
             ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
        ),
        insertIfAbsent: sql.prepare(
            'INSERT INTO streamers (id, display_name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING',
        ),
        releaseLogin: sql.prepare('UPDATE streamers SET login = NULL WHERE login = ? AND id <> ?'),
        upsertIdentity: sql.prepare(
            `INSERT INTO streamers (id, login, display_name) VALUES (?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET login = excluded.login, display_name = excluded.display_name`,
        ),
        saveGrant: sql.prepare(
            `INSERT INTO twitch_grants
                 (streamer_id, access_token, refresh_token, expires_at, scopes, granted_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (streamer_id) DO UPDATE SET
                 access_token = excluded.access_token,
                 refresh_token = excluded.refresh_token,
                 expires_at = excluded.expires_at,
                 scopes = excluded.scopes,
                 granted_at = excluded.granted_at,
                 last_validated_at = NULL,
                 revoked_at = NULL`,
        ),
        writeSnapshot: sql.prepare(
            'UPDATE streamers SET snapshot = ?, schema_version = ?, updated_at = ? WHERE id = ?',
        ),
        readSnapshot: sql.prepare(
            'SELECT snapshot, schema_version, updated_at FROM streamers WHERE id = ?',
        ),
    };

    const asStreamer = (row: unknown): Streamer | null => (row ? (row as Streamer) : null);

    return {
        getStreamer(id: string): Streamer | null {
            return asStreamer(q.byId.get(id));
        },

        /**
         * Resolve the name in a viewer URL to a streamer. Tries the Twitch login first, then the
         * display name case-insensitively. Names are opaque strings; their characters are not validated.
         */
        resolveStreamer(name: string): Streamer | null {
            return (
                asStreamer(q.byLogin.get(name.toLowerCase())) ??
                asStreamer(q.byDisplayName.get(name))
            );
        },

        /** Make sure a row exists for a streamer known only from a mod token. Never overwrites names. */
        ensureStreamer(id: string, displayName: string): Streamer {
            q.insertIfAbsent.run(id, displayName);
            return asStreamer(q.byId.get(id))!;
        },

        /** Record what Twitch says this account is called right now. Called at website login. */
        upsertIdentity(streamer: { id: string; login: string; display_name: string }): void {
            const login = streamer.login.toLowerCase();
            sql.exec('BEGIN');
            try {
                // A login can move between accounts after a rename; the newest claim wins.
                q.releaseLogin.run(login, streamer.id);
                q.upsertIdentity.run(streamer.id, login, streamer.display_name);
                sql.exec('COMMIT');
            } catch (err) {
                sql.exec('ROLLBACK');
                throw err;
            }
        },

        /**
         * Keep what Twitch granted at a login, replacing any earlier grant for the streamer.
         * The streamer's row must already exist.
         */
        saveGrant(streamerId: string, grant: TwitchGrant): void {
            assertUnixMs(grant.expires_at, 'expires_at');
            assertUnixMs(grant.granted_at, 'granted_at');
            q.saveGrant.run(
                streamerId,
                grant.access_token,
                grant.refresh_token,
                grant.expires_at,
                grant.scopes,
                grant.granted_at,
            );
        },

        /** Store a canonical snapshot. `now` is unix ms. Returns false if the streamer does not exist. */
        writeSnapshot(id: string, snapshot: InsertableSnapshot, now: number): boolean {
            assertUnixMs(now, 'now');
            const result = q.writeSnapshot.run(JSON.stringify(snapshot), SCHEMA_VERSION, now, id);
            return result.changes > 0;
        },

        /**
         * The streamer's snapshot at the current schema version, with `received_at` taken from the
         * row. Migrates and writes back if the stored version was older.
         */
        readSnapshot(id: string): Snapshot | null {
            const row = q.readSnapshot.get(id) as
                | {
                      snapshot: string | null;
                      schema_version: number | null;
                      updated_at: number | null;
                  }
                | undefined;
            if (
                !row ||
                row.snapshot === null ||
                row.schema_version === null ||
                row.updated_at === null
            ) {
                return null;
            }
            // The column holds JSON at whatever version the row says. It only becomes a snapshot
            // by going through migrate(), which checks that version and upgrades older data.
            const parsed: unknown = JSON.parse(row.snapshot);
            const selected: SelectableSnapshot = migrate(parsed, row.schema_version);
            if (row.schema_version !== SCHEMA_VERSION) {
                q.writeSnapshot.run(JSON.stringify(selected), SCHEMA_VERSION, row.updated_at, id);
                log.info({
                    message: 'stored snapshot migrated',
                    streamer: id,
                    from_version: row.schema_version,
                    to_version: SCHEMA_VERSION,
                });
            }
            // `selected` was created in this call, so assigning onto it is safe.
            return Object.assign(selected, { received_at: row.updated_at });
        },

        /** Escape hatch for tests and one-off scripts. */
        raw: sql,

        close(): void {
            sql.close();
        },
    };
}
