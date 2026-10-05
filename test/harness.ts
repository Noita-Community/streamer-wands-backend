// A whole server for tests: real database (in memory), real sessions and releases, listening on
// a local port. Only Twitch is faked.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';

import { createApp } from '../server/app.ts';
import { Secret } from '../server/config.ts';
import { openDb } from '../server/db.ts';
import { silentLogger } from '../server/log.ts';
import { loadReleases, releaseFilename } from '../server/releases.ts';
import { createSessions } from '../server/session.ts';
import { createTwitch } from '../server/twitch.ts';

export const JWT_SECRET = new Secret('test-jwt-secret');

/** The mod versions the test server offers, newest first. */
export const VERSIONS = ['1.2.10', '1.2.9'];

/**
 * A port nothing is listening on. The server has to know its own address before it starts,
 * because it writes that address into pages and downloads.
 */
async function freePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => probe.close(resolve));
    return port;
}

/** A stand-in release: a zip shaped like the mod, with the placeholder token it ships with. */
async function writeRelease(dir: string, version: string): Promise<void> {
    const zip = new JSZip();
    zip.file('streamer_wands/init.lua', `-- the mod, version ${version}\r\n`);
    zip.file('streamer_wands/token.lua', 'return "your_token_here"');
    const packed = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    writeFileSync(join(dir, releaseFilename(version)), packed);
}

/** A stand-in frontend: pages that hold only their data, and one static file. */
function writeStubFrontend(dir: string): void {
    mkdirSync(join(dir, 'pages'));
    mkdirSync(join(dir, 'static'));
    for (const page of ['index', 'streamer', 'nostreamer']) {
        writeFileSync(join(dir, 'pages', `${page}.html`), `<p>${page}</p><!-- page-data -->`);
    }
    writeFileSync(join(dir, 'static', 'hello.css'), 'p { color: red }');
}

/**
 * Twitch, faked. The "code" a login comes back with names the account outright, as
 * id:login:display_name, and the fake hands the same string back as the access token.
 */
const fakeTwitchFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/oauth2/token')) {
        const code = (init?.body as URLSearchParams).get('code') ?? '';
        if (code === 'rejected') return new Response('{}', { status: 400 });
        // What fetch does when it cannot connect.
        if (code === 'unreachable') throw new TypeError('fetch failed');
        return Response.json({ access_token: code, refresh_token: 'refresh', expires_in: 3600 });
    }
    const bearer = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
    const [id, login, display_name] = bearer.split(':');
    return Response.json({ data: [{ id, login, display_name }] });
};

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;

export async function startTestApp(
    options: {
        /** A built frontend to serve. Omit for stub pages. */
        webDir?: string;
        /** unix ms clock */
        now?: () => number;
    } = {},
) {
    const scratch = mkdtempSync(join(tmpdir(), 'onlywands-test-'));
    const releasesDir = join(scratch, 'releases');
    mkdirSync(releasesDir);
    for (const version of VERSIONS) await writeRelease(releasesDir, version);

    let webDir = options.webDir;
    if (!webDir) {
        webDir = join(scratch, 'web');
        mkdirSync(webDir);
        writeStubFrontend(webDir);
    }

    const port = await freePort();
    const host = `127.0.0.1:${port}`;
    const publicUrl = `http://${host}`;
    const now = options.now ?? Date.now;

    const db = openDb(':memory:');
    const app = createApp({
        db,
        jwtSecret: JWT_SECRET,
        log: silentLogger,
        releases: loadReleases({ dir: releasesDir, publicUrl }),
        sessions: createSessions({ secret: new Secret('test-session-secret'), secure: false, now }),
        twitch: createTwitch({
            clientId: 'test-client-id',
            clientSecret: new Secret('test-client-secret'),
            redirectUri: `${publicUrl}/auth/twitch/callback`,
            fetch: fakeTwitchFetch,
            now,
        }),
        publicUrl,
        webDir,
        now,
    });
    await new Promise<void>((resolve) => app.server.listen(port, '127.0.0.1', resolve));

    return {
        app,
        db,
        /** host:port */
        host,
        /** http://host:port */
        publicUrl,
        async close(): Promise<void> {
            await app.close();
            db.close();
            rmSync(scratch, { recursive: true, force: true });
        },
    };
}
