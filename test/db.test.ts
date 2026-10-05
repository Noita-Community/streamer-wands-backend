import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb } from '../server/db.ts';
import { SCHEMA_VERSION, fromWire, type InsertableSnapshot } from '../server/schema.ts';
import { dbStrictEqual } from './support.ts';

const wire = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/wire-${name}.json`, import.meta.url), 'utf8'));

const insertable = (name: string): InsertableSnapshot => {
    const s = fromWire(wire(name));
    assert.ok(s);
    return s;
};

const T0 = 1_760_000_000_000;

describe('db identity', () => {
    it('resolves a streamer by login, then by display name, case-insensitively', () => {
        const db = openDb(':memory:');
        db.upsertIdentity({ id: '1', login: 'dunkorslam', display_name: 'DunkOrSlam' });
        for (const name of ['dunkorslam', 'DunkOrSlam', 'DUNKORSLAM']) {
            assert.equal(db.resolveStreamer(name)?.id, '1', name);
        }
        assert.equal(db.resolveStreamer('nobody'), null);
        db.close();
    });

    it('resolves a non-ASCII display name, and that account by its login too', () => {
        const db = openDb(':memory:');
        db.upsertIdentity({ id: '2', login: 'suzume_nichirin', display_name: 'すずめ日輪' });
        assert.equal(db.resolveStreamer('すずめ日輪')?.id, '2');
        assert.equal(db.resolveStreamer('Suzume_Nichirin')?.id, '2');
        db.close();
    });

    it('resolves a migrated streamer that has a display name but no login yet', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('3', 'SomeStreamer');
        dbStrictEqual(db.resolveStreamer('somestreamer'), {
            id: '3',
            login: null,
            display_name: 'SomeStreamer',
        });
        db.close();
    });

    it('prefers a login match over another account with that display name', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('old', 'Alice');
        db.upsertIdentity({ id: 'new', login: 'alice', display_name: 'アリス' });
        assert.equal(db.resolveStreamer('alice')?.id, 'new');
        db.close();
    });

    it('ensureStreamer never overwrites names already on the row', () => {
        const db = openDb(':memory:');
        db.upsertIdentity({ id: '1', login: 'current', display_name: 'Current' });
        const row = db.ensureStreamer('1', 'StaleNameFromToken');
        assert.equal(row.display_name, 'Current');
        assert.equal(row.login, 'current');
        db.close();
    });

    it('upsertIdentity follows a rename and moves a login to its newest claimant', () => {
        const db = openDb(':memory:');
        db.upsertIdentity({ id: '1', login: 'first', display_name: 'First' });
        db.upsertIdentity({ id: '1', login: 'renamed', display_name: 'Renamed' });
        assert.equal(db.resolveStreamer('first'), null);
        assert.equal(db.resolveStreamer('renamed')?.id, '1');

        db.upsertIdentity({ id: '2', login: 'renamed', display_name: 'Renamed' });
        assert.equal(db.getStreamer('1')?.login, null);
        assert.equal(db.resolveStreamer('renamed')?.id, '2');
        db.close();
    });

    it('keeps ids as strings, including ones beyond Number.MAX_SAFE_INTEGER', () => {
        const db = openDb(':memory:');
        const id = '9007199254740993123';
        db.ensureStreamer(id, 'Big');
        assert.equal(db.getStreamer(id)?.id, id);
        db.close();
    });
});

describe('db snapshots', () => {
    it('returns null when a streamer has no snapshot or does not exist', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        assert.equal(db.readSnapshot('1'), null);
        assert.equal(db.readSnapshot('missing'), null);
        db.close();
    });

    it('round-trips a snapshot and attaches received_at from the row', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        const written = insertable('current-full');
        assert.equal(db.writeSnapshot('1', written, T0), true);
        assert.deepEqual(db.readSnapshot('1'), { ...written, received_at: T0 });
        db.close();
    });

    it('does not store received_at or a version inside the JSON', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        db.writeSnapshot('1', insertable('current-minimal'), T0);
        const row = db.raw
            .prepare('SELECT snapshot, schema_version, updated_at FROM streamers WHERE id = ?')
            .get('1') as { snapshot: string; schema_version: number; updated_at: number };
        const stored = JSON.parse(row.snapshot);
        assert.ok(!('received_at' in stored));
        assert.ok(!('schema_version' in stored));
        assert.equal(row.schema_version, SCHEMA_VERSION);
        assert.equal(row.updated_at, T0);
        db.close();
    });

    it('reports false when writing for a streamer that does not exist', () => {
        const db = openDb(':memory:');
        assert.equal(db.writeSnapshot('missing', insertable('current-minimal'), T0), false);
        db.close();
    });

    it('refuses a timestamp that is not integer unix milliseconds', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        const snap = insertable('current-minimal');
        for (const bad of [1.5, -1, NaN, new Date() as unknown as number]) {
            assert.throws(() => db.writeSnapshot('1', snap, bad), /unix milliseconds/);
        }
        db.close();
    });

    it('refuses to read a row whose schema version is newer than this build', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        db.writeSnapshot('1', insertable('current-minimal'), T0);
        db.raw
            .prepare('UPDATE streamers SET schema_version = ? WHERE id = ?')
            .run(SCHEMA_VERSION + 1, '1');
        assert.throws(() => db.readSnapshot('1'), /newer/);
        db.close();
    });
});

describe('db strictness', () => {
    it('rejects a value of the wrong type for a column', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        assert.throws(
            () =>
                db.raw
                    .prepare('UPDATE streamers SET updated_at = ? WHERE id = ?')
                    .run('yesterday', '1'),
            /cannot store TEXT value in INTEGER column/,
        );
        db.close();
    });

    it('rejects a snapshot that is not valid JSON', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        assert.throws(
            () =>
                db.raw
                    .prepare(
                        'UPDATE streamers SET snapshot = ?, schema_version = 1, updated_at = 1 WHERE id = ?',
                    )
                    .run('{not json', '1'),
            /CHECK constraint failed/,
        );
        db.close();
    });

    it('rejects a snapshot without its version and timestamp, and vice versa', () => {
        const db = openDb(':memory:');
        db.ensureStreamer('1', 'A');
        assert.throws(
            () => db.raw.prepare("UPDATE streamers SET snapshot = '{}' WHERE id = ?").run('1'),
            /CHECK constraint failed/,
        );
        assert.throws(
            () => db.raw.prepare('UPDATE streamers SET schema_version = 1 WHERE id = ?').run('1'),
            /CHECK constraint failed/,
        );
        db.close();
    });

    it('enforces foreign keys', () => {
        const db = openDb(':memory:');
        assert.throws(
            () =>
                db.raw
                    .prepare(
                        `INSERT INTO twitch_grants (streamer_id, access_token, refresh_token, expires_at, scopes, granted_at)
                         VALUES ('missing', 'a', 'r', 1, '', 1)`,
                    )
                    .run(),
            /FOREIGN KEY constraint failed/,
        );
        db.close();
    });
});

describe('db file', () => {
    it('creates the file and parent directory, and reopens without re-running DDL', () => {
        const dir = mkdtempSync(join(tmpdir(), 'onlywands-db-'));
        try {
            const path = join(dir, 'nested', 'test.sqlite');
            const first = openDb(path);
            first.ensureStreamer('1', 'A');
            first.writeSnapshot('1', insertable('current-minimal'), T0);
            first.close();

            const second = openDb(path);
            assert.equal(second.readSnapshot('1')?.received_at, T0);
            second.close();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
