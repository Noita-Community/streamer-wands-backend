// Builds the HTTP server and attaches the websocket server to it. Nothing listens here,
// so tests can bind to an ephemeral port.
//
// Phase 1 routes: a health check and the JSON a viewer page starts from. The site's pages
// (index, login, bundle download, static files) arrive in later phases.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Secret } from './config.ts';
import type { Db } from './db.ts';
import type { Logger } from './log.ts';
import { createWsServer } from './ws.ts';

export type AppOptions = {
    db: Db;
    jwtSecret: Secret;
    log: Logger;
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

export function createApp(options: AppOptions) {
    const { db, log } = options;
    const ws = createWsServer(options);

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
            let name: string;
            try {
                name = decodeURIComponent(api[1]!);
            } catch {
                return sendJson(res, 400, { error: 'bad name' });
            }
            const streamer = db.resolveStreamer(name);
            if (!streamer) return sendJson(res, 404, { error: 'no such streamer' });
            return sendJson(res, 200, {
                streamer: { login: streamer.login, display_name: streamer.display_name },
                snapshot: db.readSnapshot(streamer.id),
            });
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
