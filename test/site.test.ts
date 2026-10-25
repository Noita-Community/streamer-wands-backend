// The website over HTTP: logging in, the data written into each page, and downloading the mod.

import { afterAll, beforeAll, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

import type { IndexPageData, StreamerPageData } from '../server/page-data.ts';
import { verifyToken } from '../server/token.ts';
import { JWT_SECRET, VERSIONS, startTestApp, type TestApp } from './harness.ts';
import { dbStrictEqual } from './support.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/** The data the server wrote into a page. */
function pageData<T>(html: string): T {
    const match = /<script type="application\/json" id="page-data">(.*?)<\/script>/s.exec(html);
    assert.ok(match, 'the page carries no data');
    return JSON.parse(match[1]!) as T;
}

describe('site', () => {
    let server: TestApp;
    beforeAll(async () => {
        server = await startTestApp();
    });
    afterAll(() => server.close());

    /** Just enough of a browser: it keeps cookies and does not follow redirects. */
    class Browser {
        #cookies = new Map<string, string>();

        async request(path: string, init: RequestInit = {}): Promise<Response> {
            const cookie = [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
            const res = await fetch(`${server.publicUrl}${path}`, {
                ...init,
                redirect: 'manual',
                headers: { ...init.headers, cookie },
            });
            for (const set of res.headers.getSetCookie()) {
                const [pair = ''] = set.split(';');
                const [name = '', value = ''] = pair.split('=');
                if (set.includes('Max-Age=0')) this.#cookies.delete(name);
                else this.#cookies.set(name, value);
            }
            return res;
        }

        /** Go to Twitch and come back. `account` is id:login:display_name (see the harness). */
        async login(account: string): Promise<Response> {
            const toTwitch = await this.request('/auth/login');
            const state = new URL(toTwitch.headers.get('location')!).searchParams.get('state')!;
            return this.request(
                `/auth/twitch/callback?code=${encodeURIComponent(account)}&state=${state}`,
            );
        }

        async index(): Promise<IndexPageData> {
            return pageData(await (await this.request('/')).text());
        }

        /** Submit the download form. */
        download(fields: Record<string, string | Blob>): Promise<Response> {
            const form = new FormData();
            for (const [name, value] of Object.entries(fields)) form.set(name, value);
            return this.request('/release', { method: 'POST', body: form });
        }
    }

    describe('logging in', () => {
        it('shows the front page to someone logged out', async () => {
            assert.deepEqual(await new Browser().index(), { user: null, versions: VERSIONS });
        });

        it('sends the browser to Twitch, asking to come back to this site', async () => {
            const res = await new Browser().request('/auth/login');
            assert.equal(res.status, 302);
            const twitch = new URL(res.headers.get('location')!);
            assert.equal(twitch.origin + twitch.pathname, 'https://id.twitch.tv/oauth2/authorize');
            assert.equal(twitch.searchParams.get('client_id'), 'test-client-id');
            assert.equal(
                twitch.searchParams.get('redirect_uri'),
                `${server.publicUrl}/auth/twitch/callback`,
            );
            assert.equal(twitch.searchParams.get('response_type'), 'code');
            // No scopes: the site only needs to know who logged in.
            assert.equal(twitch.searchParams.get('scope'), null);
        });

        it('still answers at the previous site’s login address', async () => {
            assert.equal((await new Browser().request('/auth/login/beta')).status, 302);
        });

        it('logs in, records the account and its grant, and logs out', async () => {
            const browser = new Browser();
            const back = await browser.login('42:alice:Alice');
            assert.equal(back.status, 302);
            assert.equal(back.headers.get('location'), '/');
            assert.deepEqual((await browser.index()).user, {
                login: 'alice',
                display_name: 'Alice',
            });

            dbStrictEqual(server.db.getStreamer('42'), {
                id: '42',
                login: 'alice',
                display_name: 'Alice',
            });
            const grant = server.db.raw
                .prepare('SELECT access_token, scopes FROM twitch_grants WHERE streamer_id = ?')
                .get('42');
            assert.equal(grant?.access_token, '42:alice:Alice');
            assert.equal(grant?.scopes, '');

            assert.equal((await browser.request('/auth/logout')).status, 302);
            assert.equal((await browser.index()).user, null);
        });

        it('refuses a login this browser did not start', async () => {
            const browser = new Browser();
            const res = await browser.request('/auth/twitch/callback?code=42:alice:Alice&state=x');
            assert.equal(res.status, 400);
            assert.equal((await browser.index()).user, null);
        });

        it('lets each trip to Twitch complete only one login', async () => {
            const browser = new Browser();
            const toTwitch = await browser.request('/auth/login');
            const state = new URL(toTwitch.headers.get('location')!).searchParams.get('state')!;
            const callback = `/auth/twitch/callback?code=42:alice:Alice&state=${state}`;
            assert.equal((await browser.request(callback)).status, 302);
            assert.equal((await browser.request(callback)).status, 400);
        });

        it('returns quietly to the front page when the user declines on Twitch', async () => {
            const browser = new Browser();
            const toTwitch = await browser.request('/auth/login');
            const state = new URL(toTwitch.headers.get('location')!).searchParams.get('state')!;
            const res = await browser.request(
                `/auth/twitch/callback?error=access_denied&state=${state}`,
            );
            assert.equal(res.status, 302);
            assert.equal((await browser.index()).user, null);
        });

        it('says so when Twitch refuses the login, or cannot be reached', async () => {
            for (const failure of ['rejected', 'unreachable']) {
                const browser = new Browser();
                const res = await browser.login(failure);
                assert.equal(res.status, 502, failure);
                assert.match(await res.text(), /Twitch did not complete the login/);
                assert.equal((await browser.index()).user, null);
            }
        });

        it('ignores a session cookie it did not sign', async () => {
            const forged = Buffer.from(JSON.stringify({ id: '42', exp: 9e15 })).toString(
                'base64url',
            );
            const res = await fetch(`${server.publicUrl}/`, {
                headers: { cookie: `session=${forged}.AAAA` },
            });
            assert.equal(pageData<IndexPageData>(await res.text()).user, null);
        });
    });

    describe('the viewer page', () => {
        it('is served with the streamer, the feed address and the newest mod version', async () => {
            await new Browser().login('50:bob:Bob');
            const res = await fetch(`${server.publicUrl}/streamer/BOB`);
            assert.equal(res.status, 200);
            assert.deepEqual(pageData<StreamerPageData>(await res.text()), {
                streamer: { login: 'bob', display_name: 'Bob' },
                feed_url: `ws://${server.host}/client=BOB`,
                current_mod_version: '1.2.10',
                snapshot: null,
            });
        });

        it('answers 404 with the not-found page for a name nobody has', async () => {
            const res = await fetch(`${server.publicUrl}/streamer/nobody_at_all`);
            assert.equal(res.status, 404);
            assert.match(await res.text(), /<p>nostreamer<\/p>/);
        });

        it('keeps text in the data from ending the script element it is written into', async () => {
            const name = '</script><script>alert(1)</script>';
            await new Browser().login(`60:mallory:${name}`);
            const html = await (await fetch(`${server.publicUrl}/streamer/mallory`)).text();
            // One element, closed once.
            assert.equal(html.split('</script>').length, 2);
            assert.equal(pageData<StreamerPageData>(html).streamer.display_name, name);
        });
    });

    describe('downloading the mod', () => {
        const filesIn = async (res: Response) => {
            const zip = await JSZip.loadAsync(await res.arrayBuffer());
            const read = (path: string) => zip.file(`streamer_wands/${path}`)!.async('string');
            return { zip, read };
        };

        it('is refused to someone logged out', async () => {
            assert.equal((await new Browser().download({ version: '1.2.10' })).status, 403);
        });

        it('adds the streamer’s token, the version and this server’s address to the release', async () => {
            const browser = new Browser();
            await browser.login('70:carol:Carol');
            const res = await browser.download({ version: '1.2.9' });
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'application/zip');
            assert.equal(
                res.headers.get('content-disposition'),
                'attachment; filename="streamer_wands--1.2.9.zip"',
            );

            const { read } = await filesIn(res);
            assert.equal(await read('init.lua'), '-- the mod, version 1.2.9\r\n');
            assert.equal(await read('version.lua'), 'return "1.2.9"');
            assert.equal(await read('stats.lua'), 'stats = {}');
            assert.match(
                await read('files/ws/host.lua'),
                new RegExp(`HOST_URL = "ws://${server.host}/" \\.\\. token`),
            );
            const token = /^return "(.+)"$/.exec(await read('token.lua'))?.[1];
            assert.deepEqual(verifyToken(token ?? '', JWT_SECRET), {
                id: '70',
                displayName: 'Carol',
            });
        });

        it('includes the streamer’s kill statistics when they upload their stats file', async () => {
            const browser = new Browser();
            await browser.login('70:carol:Carol');
            const res = await browser.download({
                version: '1.2.10',
                statsfile: new Blob([fixture('_stats0.salakieli')]),
            });
            assert.equal(res.status, 200);
            const { read } = await filesIn(res);
            assert.equal(await read('stats.lua'), fixture('stats0.lua').toString('utf8'));
        });

        it('refuses a stats file it cannot read, and a version it does not have', async () => {
            const browser = new Browser();
            await browser.login('70:carol:Carol');
            const garbage = await browser.download({
                version: '1.2.10',
                statsfile: new Blob(['not a stats file']),
            });
            assert.equal(garbage.status, 400);
            assert.match(await garbage.text(), /stats file/);

            assert.equal((await browser.download({ version: '0.0.1' })).status, 400);
            assert.equal((await browser.download({})).status, 400);
        });
    });

    describe('static files', () => {
        it('serves what is under static/, and nothing else from the frontend', async () => {
            const res = await fetch(`${server.publicUrl}/static/hello.css`);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8');
            // Fonts and images keep their names when they change, so they are not cached for long.
            assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');

            for (const path of ['/pages/index.html', '/static/%2e%2e/pages/index.html', '/nope']) {
                assert.equal((await fetch(`${server.publicUrl}${path}`)).status, 404, path);
            }
        });

        it('tells browsers not to guess at content types, on every kind of response', async () => {
            for (const path of ['/', '/static/hello.css', '/healthz', '/nope', '/auth/login']) {
                const res = await fetch(`${server.publicUrl}${path}`, { redirect: 'manual' });
                assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
            }
        });
    });
});
