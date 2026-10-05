// Logging in with Twitch: the OAuth authorization code flow, and one Helix call to learn who
// logged in. No scopes are requested. All this site needs from Twitch is the account's id and
// names, which any user token can read for its own account.
//
//   1. Send the browser to authorizeUrl(state).
//   2. Twitch sends it back to the redirect URI with ?code=...&state=...
//   3. login(code) trades the code for tokens and looks the user up.

import type { Secret } from './config.ts';

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';

export type TwitchUser = {
    /** Stable account id, always a string */
    id: string;
    /** Lowercase account name; changes if the user renames */
    login: string;
    /** The login in the user's own capitalisation, or a localised name in another script */
    display_name: string;
};

/** What Twitch granted at login. Kept so the grant can be validated and refreshed later. */
export type TwitchGrant = {
    access_token: string;
    refresh_token: string;
    /** unix ms */
    expires_at: number;
    /** Space-separated; empty when no scopes were requested */
    scopes: string;
    /** unix ms */
    granted_at: number;
};

export class TwitchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TwitchError';
    }
}

export type Twitch = ReturnType<typeof createTwitch>;

export function createTwitch(options: {
    clientId: string;
    clientSecret: Secret;
    /** Where Twitch sends the browser back to. Must be registered on the Twitch application. */
    redirectUri: string;
    /** Injectable for tests */
    fetch?: typeof fetch;
    /** unix ms clock; injectable for tests */
    now?: () => number;
}) {
    const { clientId, clientSecret, redirectUri, now = Date.now } = options;
    const request = options.fetch ?? fetch;

    /** Parse a response as a JSON object, or fail saying which step went wrong. */
    async function json(res: Response, step: string): Promise<Record<string, unknown>> {
        if (!res.ok) throw new TwitchError(`${step}: Twitch answered ${res.status}`);
        const body: unknown = await res.json();
        if (typeof body !== 'object' || body === null) {
            throw new TwitchError(`${step}: Twitch sent something that is not an object`);
        }
        return body as Record<string, unknown>;
    }

    return {
        /** Where to send the browser to log in. `state` comes back unchanged on the redirect. */
        authorizeUrl(state: string): string {
            const query = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: 'code',
                state,
            });
            return `${AUTHORIZE_URL}?${query}`;
        },

        /** Complete a login from the code Twitch put on the redirect. */
        async login(code: string): Promise<{ user: TwitchUser; grant: TwitchGrant }> {
            const grantedAt = now();
            const token = await json(
                await request(TOKEN_URL, {
                    method: 'POST',
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret.unwrap(),
                        code,
                        grant_type: 'authorization_code',
                        redirect_uri: redirectUri,
                    }),
                }),
                'exchanging the code',
            );
            const { access_token, refresh_token, expires_in, scope } = token;
            if (
                typeof access_token !== 'string' ||
                typeof refresh_token !== 'string' ||
                typeof expires_in !== 'number'
            ) {
                throw new TwitchError('exchanging the code: the token response is incomplete');
            }

            const users = await json(
                await request(USERS_URL, {
                    headers: { authorization: `Bearer ${access_token}`, 'client-id': clientId },
                }),
                'looking up the user',
            );
            const user: unknown = Array.isArray(users.data) ? users.data[0] : undefined;
            const { id, login, display_name } = (user ?? {}) as Record<string, unknown>;
            if (
                typeof id !== 'string' ||
                typeof login !== 'string' ||
                typeof display_name !== 'string'
            ) {
                throw new TwitchError('looking up the user: no user in the response');
            }

            return {
                user: { id, login, display_name },
                grant: {
                    access_token,
                    refresh_token,
                    expires_at: grantedAt + expires_in * 1000,
                    // Twitch leaves `scope` out when none were requested.
                    scopes: Array.isArray(scope) ? scope.join(' ') : '',
                    granted_at: grantedAt,
                },
            };
        },
    };
}
