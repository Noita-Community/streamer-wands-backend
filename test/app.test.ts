// End-to-end over real sockets: a fake mod pushes wire payloads in, fake viewers receive
// canonical snapshots out.

import { afterAll, beforeAll, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';

import { createApp } from '../server/app.ts';
import { Secret } from '../server/config.ts';
import { openDb } from '../server/db.ts';
import { silentLogger } from '../server/log.ts';
import { signTicket } from '../server/ticket.ts';

const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const GENERATIONS = [
    'current-minimal',
    'current-full',
    'current-apotheosis',
    'middle-generation',
    'oldest-array',
];

const SECRET = new Secret('test-secret');
const STREAMER = { id: '12345678', displayName: 'DunkOrSlam' };

/** A websocket client that queues what it receives, so nothing is lost between open and await. */
class Client {
    ws: WebSocket;
    #queue: string[] = [];
    #waiters: ((message: string) => void)[] = [];

    constructor(ws: WebSocket) {
        this.ws = ws;
        ws.on('message', (data) => {
            const text = data.toString();
            const waiter = this.#waiters.shift();
            if (waiter) waiter(text);
            else this.#queue.push(text);
        });
    }

    next(timeoutMs = 2000): Promise<unknown> {
        const queued = this.#queue.shift();
        if (queued !== undefined) return Promise.resolve(JSON.parse(queued));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('timed out waiting for a message')),
                timeoutMs,
            );
            this.#waiters.push((text) => {
                clearTimeout(timer);
                resolve(JSON.parse(text));
            });
        });
    }

    /** Resolves true if nothing arrives within the window. */
    async quiet(windowMs = 150): Promise<boolean> {
        if (this.#queue.length > 0) return false;
        await new Promise((r) => setTimeout(r, windowMs));
        return this.#queue.length === 0;
    }

    close(): Promise<void> {
        return new Promise((resolve) => {
            if (this.ws.readyState === WebSocket.CLOSED) return resolve();
            this.ws.once('close', () => resolve());
            this.ws.close();
        });
    }
}

describe('app', () => {
    let clock = 1_760_000_000_000;
    const db = openDb(':memory:');
    const app = createApp({
        db,
        jwtSecret: SECRET,
        log: silentLogger,
        modVersion: '1.2.10',
        now: () => clock,
    });
    let base = '';
    const clients: Client[] = [];

    beforeAll(async () => {
        await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
        base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await Promise.all(clients.map((c) => c.close()));
        await app.close();
        db.close();
    });

    /** Opens a socket, or rejects with the HTTP status the upgrade was refused with. */
    const connect = (path: string): Promise<Client> =>
        new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${base}/${path}`);
            const client = new Client(ws);
            ws.once('open', () => {
                clients.push(client);
                resolve(client);
            });
            ws.once('unexpected-response', (_req, res) => reject(res.statusCode));
            ws.once('error', (err) => reject(err));
        });

    const connectMod = (who = STREAMER) => connect(signTicket(who, SECRET));

    it('answers the health check', async () => {
        const res = await fetch(`http://${base}/healthz`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true });
    });

    it('refuses a mod with a bad ticket, and an empty path', async () => {
        await assert.rejects(connect('not-a-ticket'), (status) => status === 401);
        await assert.rejects(
            connect(signTicket(STREAMER, new Secret('wrong'))),
            (status) => status === 401,
        );
        await assert.rejects(connect(''), (status) => status === 400);
    });

    it('refuses a viewer for a streamer that does not exist', async () => {
        await assert.rejects(connect('client=nobody_at_all'), (status) => status === 404);
    });

    it('creates the streamer row when a mod first connects with a valid ticket', async () => {
        const mod = await connectMod();
        assert.equal(db.getStreamer(STREAMER.id)?.display_name, 'DunkOrSlam');
        await mod.close();
    });

    it('sends a new viewer nothing while there is no snapshot yet', async () => {
        const viewer = await connect('client=dunkorslam');
        assert.ok(await viewer.quiet());
        await viewer.close();
    });

    for (const gen of GENERATIONS) {
        it(`delivers the ${gen} payload to viewers in canonical form`, async () => {
            const mod = await connectMod();
            const viewer = await connect('client=DunkOrSlam');
            // The viewer may get the previous test's snapshot on connect; drain it.
            await viewer.quiet(50);
            while (!(await viewer.quiet(20))) await viewer.next();

            clock += 1000;
            mod.ws.send(JSON.stringify(fixture(`wire-${gen}`)));

            const expected = { ...(fixture(`canonical-${gen}`) as object), received_at: clock };
            assert.deepEqual(await viewer.next(), expected);
            assert.deepEqual(db.readSnapshot(STREAMER.id), expected);
            await Promise.all([mod.close(), viewer.close()]);
        });
    }

    it('sends the current snapshot to a viewer as soon as it connects', async () => {
        const stored = db.readSnapshot(STREAMER.id);
        assert.ok(stored);
        const viewer = await connect('client=DUNKORSLAM');
        assert.deepEqual(await viewer.next(), stored);
        await viewer.close();
    });

    it('ignores keepalives, non-JSON, and unrecognised payloads without dropping the mod', async () => {
        const mod = await connectMod();
        const viewer = await connect('client=dunkorslam');
        await viewer.next(); // current snapshot on connect

        mod.ws.send('im alive');
        mod.ws.send('{not json');
        mod.ws.send('"just a string"');
        mod.ws.send(Buffer.from([1, 2, 3]));
        assert.ok(await viewer.quiet());

        clock += 1000;
        mod.ws.send(JSON.stringify(fixture('wire-current-minimal')));
        const received = (await viewer.next()) as { received_at: number };
        assert.equal(received.received_at, clock);
        assert.equal(mod.ws.readyState, WebSocket.OPEN);
        await Promise.all([mod.close(), viewer.close()]);
    });

    it('delivers only to viewers of that streamer', async () => {
        const other = { id: '999', displayName: 'SomeoneElse' };
        const otherMod = await connectMod(other);
        const mine = await connect('client=dunkorslam');
        const theirs = await connect('client=someoneelse');
        await mine.next(); // current snapshot on connect
        assert.ok(await theirs.quiet(50)); // no snapshot for the other streamer yet

        clock += 1000;
        otherMod.ws.send(JSON.stringify(fixture('wire-current-minimal')));
        assert.equal(((await theirs.next()) as { received_at: number }).received_at, clock);
        assert.ok(await mine.quiet());
        await Promise.all([otherMod.close(), mine.close(), theirs.close()]);
    });

    it('serves the snapshot over HTTP by name, case-insensitively', async () => {
        const res = await fetch(`http://${base}/api/streamer/DUNKORSLAM`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), {
            streamer: { login: null, display_name: 'DunkOrSlam' },
            current_mod_version: '1.2.10',
            snapshot: db.readSnapshot(STREAMER.id),
        });
    });

    it('answers 404 over HTTP for an unknown streamer and unknown paths', async () => {
        assert.equal((await fetch(`http://${base}/api/streamer/nobody_at_all`)).status, 404);
        assert.equal((await fetch(`http://${base}/nope`)).status, 404);
    });

    it('forgets a viewer when its socket closes', async () => {
        const viewer = await connect('client=dunkorslam');
        await viewer.next();
        assert.equal(app.ws.stats().watchedStreamers, 1);
        await viewer.close();
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(app.ws.stats().watchedStreamers, 0);
    });
});
