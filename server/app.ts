// Builds the HTTP server and attaches the websocket server to it. Nothing listens here,
// so tests can bind to an ephemeral port.
//
// Routes:
//   GET  /                        the front page: log in, or download the mod
//   GET  /streamer/<name>         the viewer page, or the not-found page with a 404
//   GET  /auth/login              start a Twitch login
//   GET  /auth/twitch/callback    where Twitch sends the browser back to
//   GET  /auth/logout
//   POST /release                 the logged-in streamer's copy of the mod, as a zip
//   GET  /healthz                 liveness check
//   GET  /static/...              the frontend's static files

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Secret } from './config.ts';
import type { Db } from './db.ts';
import type { Logger } from './log.ts';
import type { IndexPageData, StreamerPageData } from './page-data.ts';
import { createPages } from './pages.ts';
import { releaseFilename, type Releases } from './releases.ts';
import type { Sessions } from './session.ts';
import { createStatic } from './static.ts';
import { convertNoitaStats } from './stats.ts';
import { signToken } from './token.ts';
import { TwitchError, type Twitch } from './twitch.ts';
import { createWsServer, websocketOrigin } from './ws.ts';

export type AppOptions = {
    db: Db;
    jwtSecret: Secret;
    log: Logger;
    releases: Releases;
    sessions: Sessions;
    twitch: Twitch;
    /** Origin the site is reached at, e.g. https://onlywands.com */
    publicUrl: string;
    /** Directory holding the built frontend */
    webDir: string;
    /** unix ms clock; injectable for tests */
    now?: () => number;
    heartbeatMs?: number;
};

/**
 * The most a download request may carry. The only sizeable part is the stats file, which is
 * around a hundred kilobytes.
 */
const MAX_FORM_BYTES = 4 * 1024 * 1024;

function send(res: ServerResponse, status: number, contentType: string, body: string) {
    res.writeHead(status, {
        'content-type': contentType,
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
    });
    res.end(body);
}

const sendJson = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));

/** A plain sentence for a person, for the few errors someone using the site can run into. */
const sendText = (res: ServerResponse, status: number, body: string) =>
    send(res, status, 'text/plain; charset=utf-8', body);

function redirect(res: ServerResponse, location: string) {
    res.writeHead(302, { location, 'cache-control': 'no-store' });
    res.end();
}

/** Decode one path segment, or null if it is not valid percent-encoding. */
function decodeSegment(segment: string): string | null {
    try {
        return decodeURIComponent(segment);
    } catch {
        return null;
    }
}

/** The fields of a multipart form post, or the HTTP status to refuse it with. */
async function readForm(req: IncomingMessage): Promise<FormData | number> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_FORM_BYTES) return 413;
        chunks.push(chunk);
    }
    try {
        // The platform's own multipart parser, reached through Response.
        return await new Response(Buffer.concat(chunks), {
            headers: { 'content-type': req.headers['content-type'] ?? '' },
        }).formData();
    } catch {
        return 400;
    }
}

export function createApp(options: AppOptions) {
    const { db, jwtSecret, log, releases, sessions, twitch } = options;
    const ws = createWsServer(options);
    const sendFile = createStatic(options.webDir);
    const feedOrigin = websocketOrigin(options.publicUrl);
    const pages = createPages(options.webDir);

    /** The streamer this request is logged in as, or null. */
    const loggedIn = (req: IncomingMessage) => {
        const id = sessions.read(req);
        return id === null ? null : db.getStreamer(id);
    };

    /** Finish a login: Twitch has sent the browser back with a code, or with a refusal. */
    async function completeLogin(
        req: IncomingMessage,
        res: ServerResponse,
        query: URLSearchParams,
    ) {
        const stateMatches = sessions.checkLoginState(req, res, query.get('state'));
        const code = query.get('code');
        // The user declined on Twitch's side. Nothing went wrong.
        if (query.has('error')) return redirect(res, '/');
        if (!stateMatches || !code) {
            return sendText(res, 400, 'That login could not be completed. Please try again.');
        }

        let login;
        try {
            login = await twitch.login(code);
        } catch (err) {
            if (!(err instanceof TwitchError)) throw err;
            // Either Twitch is having trouble or this server's Twitch application is misconfigured.
            log.warn({ message: 'login failed at Twitch', err });
            return sendText(res, 502, 'Twitch did not complete the login. Please try again.');
        }
        db.upsertIdentity(login.user);
        db.saveGrant(login.user.id, login.grant);
        sessions.start(res, login.user.id);
        log.info({ message: 'logged in', streamer: login.user.id, login: login.user.login });
        return redirect(res, '/');
    }

    /** Send the logged-in streamer their copy of the mod. */
    async function download(req: IncomingMessage, res: ServerResponse) {
        const streamer = loggedIn(req);
        if (!streamer) return sendText(res, 403, 'Log in to download the mod.');

        const form = await readForm(req);
        if (typeof form === 'number') return sendText(res, form, 'That request could not be read.');

        let statsLua: string | null = null;
        const statsFile = form.get('statsfile');
        // A file input left empty still arrives, as a file of no bytes.
        if (statsFile instanceof File && statsFile.size > 0) {
            try {
                statsLua = await convertNoitaStats(new Uint8Array(await statsFile.arrayBuffer()));
            } catch {
                return sendText(
                    res,
                    400,
                    'That stats file could not be read. It should be the file named _stats.salakieli.',
                );
            }
        }

        const version = form.get('version');
        const zip =
            typeof version === 'string'
                ? await releases.build(version, {
                      token: signToken(
                          { id: streamer.id, displayName: streamer.display_name },
                          jwtSecret,
                      ),
                      statsLua,
                  })
                : null;
        if (typeof version !== 'string' || !zip) {
            return sendText(res, 400, 'There is no such version of the mod.');
        }

        log.info({
            message: 'mod downloaded',
            streamer: streamer.id,
            version,
            with_stats: statsLua !== null,
        });
        res.writeHead(200, {
            'content-type': 'application/zip',
            'content-length': zip.length,
            'content-disposition': `attachment; filename="${releaseFilename(version)}"`,
            'cache-control': 'no-store',
        });
        res.end(zip);
    }

    async function handle(req: IncomingMessage, res: ServerResponse) {
        const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost');

        if (req.method === 'POST' && pathname === '/release') return download(req, res);
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return sendJson(res, 405, { error: 'method not allowed' });
        }

        if (pathname === '/healthz') return sendJson(res, 200, { ok: true });

        if (pathname === '/') {
            const user = loggedIn(req);
            return pages.send(res, 'index', {
                user: user && { login: user.login, display_name: user.display_name },
                versions: releases.versions,
            } satisfies IndexPageData);
        }

        // Links to the previous site's login address, /auth/login/beta, still work.
        if (pathname === '/auth/login' || pathname.startsWith('/auth/login/')) {
            return redirect(res, twitch.authorizeUrl(sessions.newLoginState(res)));
        }
        if (pathname === '/auth/twitch/callback') return completeLogin(req, res, searchParams);
        if (pathname === '/auth/logout') {
            sessions.end(res);
            return redirect(res, '/');
        }

        const viewer = /^\/streamer\/([^/]+)\/?$/.exec(pathname);
        if (viewer) {
            const name = decodeSegment(viewer[1]!);
            const streamer = name === null ? null : db.resolveStreamer(name);
            // The not-found page shows the name that was asked for, which it reads from its URL.
            if (name === null || !streamer) return pages.send(res, 'nostreamer', null, 404);
            return pages.send(res, 'streamer', {
                streamer: { login: streamer.login, display_name: streamer.display_name },
                // The websocket resolves the name the same way this request just did.
                feed_url: `${feedOrigin}/client=${encodeURIComponent(name)}`,
                current_mod_version: releases.versions[0]!,
                snapshot: db.readSnapshot(streamer.id),
            } satisfies StreamerPageData);
        }

        if (sendFile(req, res, pathname)) return;

        return sendJson(res, 404, { error: 'not found' });
    }

    const server = createServer((req, res) => {
        // Every response says what it is. This stops browsers from guessing otherwise.
        res.setHeader('x-content-type-options', 'nosniff');
        handle(req, res).catch((err: unknown) => {
            log.error({ message: 'request failed', method: req.method, url: req.url, err });
            if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
            else res.end();
        });
    });

    server.on('upgrade', (req, socket, head) => {
        try {
            ws.handleUpgrade(req, socket, head);
        } catch (err) {
            log.error({ message: 'upgrade failed', url: req.url, err });
            socket.destroy();
        }
    });

    return {
        server,
        ws,
        async close(): Promise<void> {
            await ws.close();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}
