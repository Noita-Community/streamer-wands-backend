// The website's cookies. There is no session store.
//
// session       who is logged in. The cookie says which streamer and until when, and an HMAC
//               over that proves the server wrote it:
//               base64url(JSON { id, exp }) + "." + base64url(HMAC-SHA256 of the first part)
// login_state   a random value that lives for the length of one trip to Twitch and back, so a
//               login can only be completed by the browser that started it
//
// What the session cookie relies on:
//   - HMAC, not a plain hash of secret and message, so a valid signature cannot be extended to
//     cover a longer message.
//   - The signature is over the encoded payload exactly as it appears in the cookie, and that
//     same text is what gets decoded. Nothing is serialised a second time.
//   - "." cannot occur in base64url, so the two parts cannot be split any other way.
//   - The payload is parsed only after the signature has been checked, and the check takes the
//     same time wherever the signatures differ.
//   - The expiry is inside the signed payload. The cookie's Max-Age is a courtesy to the browser.
//   - The secret signs nothing else.
//
// What it does not do, by choice, until login is redesigned along with the mod token:
//   - Revocation. A copied cookie works until it expires, and logging out only makes the
//     browser forget it. HttpOnly, Secure and SameSite are what keep it from being copied.
//   - Key rotation. Changing SESSION_SECRET logs everyone out.
//
// When the site is served over HTTPS the cookies are named with the __Host- prefix. Browsers
// only accept a cookie with that name if it is Secure and belongs to exactly this host, so
// another site on a neighbouring subdomain cannot plant one.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Secret } from './config.ts';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_STATE_LIFETIME_SECONDS = 10 * 60;

/** The cookies a request carries, by name. */
function readCookies(req: IncomingMessage): Map<string, string> {
    const cookies = new Map<string, string>();
    for (const pair of (req.headers.cookie ?? '').split(';')) {
        const at = pair.indexOf('=');
        if (at < 0) continue;
        cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    return cookies;
}

type CookieOptions = {
    /** Send only over HTTPS. */
    secure: boolean;
    /** Seconds until the browser discards it. 0 deletes the cookie now. */
    maxAge: number;
};

/** Add a Set-Cookie header. Every cookie is HttpOnly, SameSite=Lax and valid for the whole site. */
function setCookie(
    res: ServerResponse,
    name: string,
    value: string,
    { secure, maxAge }: CookieOptions,
): void {
    const cookie = [
        `${name}=${value}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
        ...(secure ? ['Secure'] : []),
    ].join('; ');
    res.appendHeader('set-cookie', cookie);
}

export type Sessions = ReturnType<typeof createSessions>;

export function createSessions(options: {
    secret: Secret;
    /** Whether the site is served over HTTPS. Marks the cookies Secure and prefixes their names. */
    secure: boolean;
    /** unix ms clock; injectable for tests */
    now?: () => number;
}) {
    const { secret, secure, now = Date.now } = options;

    const prefix = secure ? '__Host-' : '';
    const SESSION_COOKIE = `${prefix}session`;
    const LOGIN_STATE_COOKIE = `${prefix}login_state`;

    const sign = (payload: string): Buffer =>
        createHmac('sha256', secret.unwrap()).update(payload).digest();

    return {
        /** The id of the streamer this request is logged in as, or null. */
        read(req: IncomingMessage): string | null {
            const value = readCookies(req).get(SESSION_COOKIE);
            if (!value) return null;
            const [payload, signature, ...rest] = value.split('.');
            if (!payload || !signature || rest.length > 0) return null;

            const expected = sign(payload);
            const given = Buffer.from(signature, 'base64url');
            if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

            try {
                const { id, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
                    id?: unknown;
                    exp?: unknown;
                };
                if (typeof id !== 'string' || typeof exp !== 'number' || exp <= now()) return null;
                return id;
            } catch {
                return null;
            }
        },

        /** Log the response's recipient in as this streamer. */
        start(res: ServerResponse, streamerId: string): void {
            const payload = Buffer.from(
                JSON.stringify({ id: streamerId, exp: now() + SESSION_LIFETIME_MS }),
            ).toString('base64url');
            const value = `${payload}.${sign(payload).toString('base64url')}`;
            setCookie(res, SESSION_COOKIE, value, { secure, maxAge: SESSION_LIFETIME_MS / 1000 });
        },

        /** Log the response's recipient out. */
        end(res: ServerResponse): void {
            setCookie(res, SESSION_COOKIE, '', { secure, maxAge: 0 });
        },

        /** Begin a login: give this browser a fresh login state and return it. */
        newLoginState(res: ServerResponse): string {
            const state = randomBytes(16).toString('hex');
            setCookie(res, LOGIN_STATE_COOKIE, state, {
                secure,
                maxAge: LOGIN_STATE_LIFETIME_SECONDS,
            });
            return state;
        },

        /**
         * Whether `state` is the login state this browser was given. The state is forgotten
         * either way, so each one can complete at most one login.
         */
        checkLoginState(req: IncomingMessage, res: ServerResponse, state: string | null): boolean {
            const expected = readCookies(req).get(LOGIN_STATE_COOKIE);
            setCookie(res, LOGIN_STATE_COOKIE, '', { secure, maxAge: 0 });
            return !!expected && expected === state;
        },
    };
}
