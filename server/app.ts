// Builds the HTTP server and attaches the websocket server to it. Nothing listens here,
// so tests can bind to an ephemeral port.
//
// Routes:
//   GET /healthz                 liveness check
//   GET /api/streamer/<name>     what the viewer page starts from, as JSON
//   GET /streamer/<name>         the viewer page, or the not-found page with a 404
//   GET anything else            a file from the built frontend, if there is one

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Secret } from './config.ts';
import type { Db } from './db.ts';
import type { Logger } from './log.ts';
import type { StreamerResponse } from './schema.ts';
import { createStatic } from './static.ts';
import { createWsServer } from './ws.ts';

export type AppOptions = {
    db: Db;
    jwtSecret: Secret;
    log: Logger;
    /** The mod version this server hands out; the viewer page warns when a streamer's differs. */
    modVersion: string;
    /** Directory holding the built frontend. Omit to serve only the API and the websocket. */
    webDir?: string;
    /** unix ms clock; injectable for tests */
    now?: () => number;
    heartbeatMs?: number;
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(text),
        'cache-control': 'no-store',
    });
    res.end(text);
}

/** Decode one path segment, or null if it is not valid percent-encoding. */
function decodeSegment(segment: string): string | null {
    try {
        return decodeURIComponent(segment);
    } catch {
        return null;
    }
}

export function createApp(options: AppOptions) {
    const { db, log, modVersion } = options;
    const ws = createWsServer(options);
    const sendFile = options.webDir ? createStatic(options.webDir) : null;

    function handle(req: IncomingMessage, res: ServerResponse) {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost');

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return sendJson(res, 405, { error: 'method not allowed' });
        }

        if (pathname === '/healthz') {
            return sendJson(res, 200, { ok: true });
        }

        const api = /^\/api\/streamer\/([^/]+)$/.exec(pathname);
        if (api) {
            const name = decodeSegment(api[1]!);
            if (name === null) return sendJson(res, 400, { error: 'bad name' });
            const streamer = db.resolveStreamer(name);
            if (!streamer) return sendJson(res, 404, { error: 'no such streamer' });
            return sendJson(res, 200, {
                streamer: { login: streamer.login, display_name: streamer.display_name },
                current_mod_version: modVersion,
                snapshot: db.readSnapshot(streamer.id),
            } satisfies StreamerResponse);
        }

        if (sendFile) {
            // The viewer page is one static file for every streamer; it reads the name from its
            // own URL. An unknown name gets the not-found page, with a 404 status.
            const page = /^\/streamer\/([^/]+)\/?$/.exec(pathname);
            if (page) {
                const name = decodeSegment(page[1]!);
                const known = name !== null && db.resolveStreamer(name) !== null;
                if (known && sendFile(req, res, '/streamer.html')) return;
                if (sendFile(req, res, '/nostreamer.html', 404)) return;
            } else if (sendFile(req, res, pathname)) {
                return;
            }
        }

        return sendJson(res, 404, { error: 'not found' });
    }

    const server = createServer((req, res) => {
        try {
            handle(req, res);
        } catch (err) {
            log.error({ message: 'request failed', method: req.method, url: req.url, err });
            if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
            else res.end();
        }
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
