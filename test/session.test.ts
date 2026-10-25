import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Secret } from '../server/config.ts';
import { createSessions } from '../server/session.ts';

const RAW = 'test-session-secret';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A response that only remembers the cookies set on it. */
function response() {
    const setCookies: string[] = [];
    const res = {
        appendHeader: (_name: string, value: string) => setCookies.push(value),
    } as unknown as ServerResponse;
    return { res, setCookies };
}

/** A request carrying these cookies, given as name=value pairs. */
const request = (...cookies: string[]) =>
    ({ headers: { cookie: cookies.join('; ') } }) as IncomingMessage;

/** The name=value part of a Set-Cookie header. */
const pair = (setCookie: string): string => setCookie.split(';')[0]!;

const encode = (payload: unknown): string =>
    Buffer.from(JSON.stringify(payload)).toString('base64url');

/** A session cookie signed the way the server signs them, with any payload. */
const forge = (payload: unknown, secret = RAW): string => {
    const encoded = encode(payload);
    const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
    return `session=${encoded}.${signature}`;
};

describe('sessions', () => {
    let clock = 1_760_000_000_000;
    const sessions = createSessions({
        secret: new Secret(RAW),
        secure: false,
        now: () => clock,
    });

    /** The cookie a login as this streamer sets. */
    const login = (id: string): string => {
        const { res, setCookies } = response();
        sessions.start(res, id);
        return pair(setCookies[0]!);
    };

    it('reads back the streamer a session was started for', () => {
        assert.equal(sessions.read(request(login('42'))), '42');
        assert.equal(sessions.read(request('other=1', login('42'), 'more=2')), '42');
    });

    it('reads nobody from a request with no session', () => {
        assert.equal(sessions.read(request()), null);
        assert.equal(sessions.read(request('session=')), null);
        assert.equal(sessions.read(request('session=not-a-session')), null);
    });

    it('stops honouring a session once it has expired', () => {
        const cookie = login('42');
        clock += 29 * DAY_MS;
        assert.equal(sessions.read(request(cookie)), '42');
        clock += 2 * DAY_MS;
        assert.equal(sessions.read(request(cookie)), null);
    });

    it('rejects a payload changed after signing', () => {
        const [, value = ''] = login('42').split('=');
        const [, signature] = value.split('.');
        const other = encode({ id: '43', exp: clock + DAY_MS });
        assert.equal(sessions.read(request(`session=${other}.${signature}`)), null);
    });

    it('rejects a signature made with another secret, or cut short, or missing', () => {
        const payload = { id: '42', exp: clock + DAY_MS };
        assert.equal(sessions.read(request(forge(payload))), '42');
        assert.equal(sessions.read(request(forge(payload, 'another-secret'))), null);
        assert.equal(sessions.read(request(forge(payload).slice(0, -4))), null);
        assert.equal(sessions.read(request(`session=${encode(payload)}`)), null);
        assert.equal(sessions.read(request(`session=${encode(payload)}.`)), null);
    });

    it('rejects extra parts, so the payload cannot be split another way', () => {
        assert.equal(sessions.read(request(`${login('42')}.extra`)), null);
    });

    it('rejects a correctly signed payload that is not a session', () => {
        assert.equal(sessions.read(request(forge({ id: 42, exp: clock + DAY_MS }))), null);
        assert.equal(sessions.read(request(forge({ id: '42' }))), null);
        assert.equal(sessions.read(request(forge({ id: '42', exp: 'never' }))), null);
        assert.equal(sessions.read(request(forge('just a string'))), null);
    });

    it('sets cookies that scripts cannot read and other sites cannot send with a post', () => {
        const { res, setCookies } = response();
        sessions.start(res, '42');
        assert.match(setCookies[0]!, /; HttpOnly/);
        assert.match(setCookies[0]!, /; SameSite=Lax/);
        assert.match(setCookies[0]!, /; Path=\//);
        assert.doesNotMatch(setCookies[0]!, /Domain=/);
        assert.doesNotMatch(setCookies[0]!, /Secure/);
    });

    it('names its cookies for this host only, and marks them Secure, when the site is HTTPS', () => {
        const secure = createSessions({ secret: new Secret(RAW), secure: true, now: () => clock });
        const { res, setCookies } = response();
        secure.start(res, '42');
        const state = secure.newLoginState(res);
        assert.match(setCookies[0]!, /^__Host-session=.*; Secure$/);
        assert.match(setCookies[1]!, /^__Host-login_state=.*; Secure$/);

        assert.equal(secure.read(request(pair(setCookies[0]!))), '42');
        assert.equal(secure.checkLoginState(request(pair(setCookies[1]!)), res, state), true);
        // A cookie under the plain name, which a neighbouring subdomain could have set, is not read.
        assert.equal(secure.read(request(pair(setCookies[0]!).replace('__Host-', ''))), null);
    });

    it('accepts the login state it gave out, and nothing else', () => {
        const { res, setCookies } = response();
        const state = sessions.newLoginState(res);
        const cookie = pair(setCookies[0]!);
        assert.equal(sessions.checkLoginState(request(cookie), res, state), true);
        assert.equal(sessions.checkLoginState(request(cookie), res, 'something-else'), false);
        assert.equal(sessions.checkLoginState(request(cookie), res, null), false);
        assert.equal(sessions.checkLoginState(request(), res, state), false);
        assert.equal(sessions.checkLoginState(request('login_state='), res, ''), false);
    });
});
