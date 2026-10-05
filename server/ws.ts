// The websocket side of the system: mods push snapshots in, viewers get them pushed out.
//
//   wss://host/<jwt>            a mod. The JWT (see token.ts) says which streamer it is.
//   wss://host/client=<name>    a viewer of that streamer's page. Anonymous.
//
// A mod sends its whole state as one JSON text frame whenever it changes, and the literal text
// "im alive" as a keepalive. Each snapshot is converted to the canonical shape, stored, and sent
// to every viewer of that streamer. Everything is keyed by Twitch id once the URL is resolved.
//
// What gets logged, and why:
//   info   a mod session starting and ending (with what it did), since "was the mod connected,
//          which version, did it send anything" is the first question when a page looks stale
//   warn   things that should not happen and that someone may need to act on: rejected tokens,
//          payloads we could not use, sockets that died without closing
//   debug  per-viewer and per-snapshot events, which are high volume and only useful when tracing

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';

import type { Secret } from './config.ts';
import type { Db } from './db.ts';
import type { Logger } from './log.ts';
import { fromWire, type Snapshot } from './schema.ts';
import { verifyToken } from './token.ts';

/** The websocket origin of a site: https://example.com becomes wss://example.com. */
export const websocketOrigin = (publicUrl: string): string => publicUrl.replace(/^http/, 'ws');

const KEEPALIVE = 'im alive';
const MAX_FRAME_BYTES = 512 * 1024;
const HEARTBEAT_MS = 30_000;

export type WsOptions = {
    db: Db;
    jwtSecret: Secret;
    log: Logger;
    /** unix ms clock; injectable for tests */
    now?: () => number;
    heartbeatMs?: number;
};

type SocketInfo = { role: 'mod' | 'viewer'; streamer: string };

export function createWsServer({
    db,
    jwtSecret,
    log,
    now = Date.now,
    heartbeatMs = HEARTBEAT_MS,
}: WsOptions) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

    /** streamer id -> sockets watching that streamer */
    const viewers = new Map<string, Set<WebSocket>>();
    const alive = new WeakSet<WebSocket>();
    const info = new WeakMap<WebSocket, SocketInfo>();

    const track = (ws: WebSocket, who: SocketInfo) => {
        info.set(ws, who);
        alive.add(ws);
        ws.on('pong', () => alive.add(ws));
        // Includes frames over MAX_FRAME_BYTES, which ws reports here before closing the socket.
        ws.on('error', (err) => log.warn({ message: 'socket error', ...who, err }));
    };

    // A socket that has neither answered a ping nor sent anything since the last sweep is gone.
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!alive.has(ws)) {
                log.warn({ message: 'socket timed out', ...info.get(ws) });
                ws.terminate();
                continue;
            }
            alive.delete(ws);
            ws.ping();
        }
    }, heartbeatMs);
    heartbeat.unref();

    function acceptMod(ws: WebSocket, streamerId: string) {
        track(ws, { role: 'mod', streamer: streamerId });
        const connectedAt = now();
        let snapshots = 0;
        let unusable = 0;
        log.info({ message: 'mod connected', streamer: streamerId });

        /** Unusable payloads repeat every few seconds; log the first, count the rest. */
        const noteUnusable = (reason: string, bytes: number) => {
            unusable += 1;
            if (unusable === 1) {
                log.warn({
                    message: 'mod sent an unusable payload',
                    streamer: streamerId,
                    reason,
                    bytes,
                });
            }
        };

        ws.on('message', (data, isBinary) => {
            alive.add(ws);
            if (isBinary) return noteUnusable('binary frame', (data as Buffer).length);
            const text = data.toString();
            if (text === KEEPALIVE) return;

            let payload: unknown;
            try {
                payload = JSON.parse(text);
            } catch {
                return noteUnusable('not JSON', text.length);
            }
            const insertable = fromWire(payload);
            if (!insertable) return noteUnusable('not a snapshot', text.length);

            const receivedAt = now();
            if (!db.writeSnapshot(streamerId, insertable, receivedAt)) {
                log.warn({
                    message: 'snapshot not stored: streamer row missing',
                    streamer: streamerId,
                });
                return;
            }
            snapshots += 1;
            if (snapshots === 1) {
                // Which mod versions are in the field is otherwise invisible.
                log.info({
                    message: 'mod sent its first snapshot',
                    streamer: streamerId,
                    mod_version: insertable.mod.version,
                });
            }

            const watching = viewers.get(streamerId);
            log.debug({
                message: 'snapshot stored',
                streamer: streamerId,
                bytes: text.length,
                viewers: watching?.size ?? 0,
            });
            if (!watching || watching.size === 0) return;
            const snapshot: Snapshot = { ...insertable, received_at: receivedAt };
            const message = JSON.stringify(snapshot);
            for (const viewer of watching) {
                if (viewer.readyState === viewer.OPEN) viewer.send(message);
            }
        });

        ws.on('close', (code) => {
            log.info({
                message: 'mod disconnected',
                streamer: streamerId,
                code,
                connected_ms: now() - connectedAt,
                snapshots,
                unusable,
            });
        });
    }

    function acceptViewer(ws: WebSocket, streamerId: string) {
        track(ws, { role: 'viewer', streamer: streamerId });
        let watching = viewers.get(streamerId);
        if (!watching) viewers.set(streamerId, (watching = new Set()));
        watching.add(ws);
        log.debug({ message: 'viewer connected', streamer: streamerId, viewers: watching.size });

        ws.on('close', () => {
            watching.delete(ws);
            if (watching.size === 0) viewers.delete(streamerId);
            log.debug({
                message: 'viewer disconnected',
                streamer: streamerId,
                viewers: watching.size,
            });
        });

        // Send the current state straight away so a viewer never has to wait for the next change,
        // and so nothing is missed between the page's initial fetch and this socket opening.
        const current = db.readSnapshot(streamerId);
        if (current) ws.send(JSON.stringify(current));
    }

    function refuse(socket: Duplex, status: number, reason: string) {
        socket.end(
            `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
    }

    function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
        socket.on('error', () => {});

        let arg: string;
        try {
            arg = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(1));
        } catch {
            return refuse(socket, 400, 'Bad Request');
        }
        if (arg === '') return refuse(socket, 400, 'Bad Request');

        if (arg.startsWith('client=')) {
            const name = arg.slice('client='.length);
            const streamer = db.resolveStreamer(name);
            if (!streamer) {
                // Routine: stale links, typos, crawlers.
                log.debug({ message: 'viewer refused: no such streamer', name });
                return refuse(socket, 404, 'Not Found');
            }
            wss.handleUpgrade(req, socket, head, (ws) => acceptViewer(ws, streamer.id));
            return;
        }

        const claims = verifyToken(arg, jwtSecret);
        if (!claims) {
            // Not routine: a mod is installed with a token this server did not sign, or someone is
            // probing. Either way the streamer's page is not updating and they will ask why.
            log.warn({ message: 'mod refused: token did not verify', token_length: arg.length });
            return refuse(socket, 401, 'Unauthorized');
        }
        // A valid token for an id with no row can only predate a database reset. Create the row
        // from the token's own claims rather than refuse a legitimately issued token.
        db.ensureStreamer(claims.id, claims.displayName);
        wss.handleUpgrade(req, socket, head, (ws) => acceptMod(ws, claims.id));
    }

    function close(): Promise<void> {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        return new Promise((resolve) => wss.close(() => resolve()));
    }

    return {
        handleUpgrade,
        close,
        stats: () => ({ sockets: wss.clients.size, watchedStreamers: viewers.size }),
    };
}
