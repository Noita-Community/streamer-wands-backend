// The mod token: how a mod proves which streamer it belongs to.
//
// When a streamer downloads the mod, the server signs a JWT identifying their Twitch account and
// writes it into the zip as token.lua. When the mod connects, that JWT is the websocket URL's
// path. Verifying it is the whole of "who is this socket".
//
// The format cannot change without every streamer downloading the mod again, because each
// installed copy carries its token: HS256, payload { id, displayName, iat }, no expiry.

import jwt from 'jsonwebtoken';

import type { Secret } from './config.ts';

/** What a mod token says about its holder. */
export type TokenClaims = {
    /** Twitch user id, always a string */
    id: string;
    /** Display name when the token was signed; may be stale. The database row is authoritative. */
    displayName: string;
};

export function signToken(claims: TokenClaims, secret: Secret): string {
    return jwt.sign({ id: claims.id, displayName: claims.displayName }, secret.unwrap(), {
        algorithm: 'HS256',
    });
}

/** The token's claims, or null for anything that does not verify or does not carry them. */
export function verifyToken(token: string, secret: Secret): TokenClaims | null {
    let payload: unknown;
    try {
        payload = jwt.verify(token, secret.unwrap(), { algorithms: ['HS256'] });
    } catch {
        return null;
    }
    if (typeof payload !== 'object' || payload === null) return null;
    const { id, displayName } = payload as Record<string, unknown>;
    // Twitch ids are strings, and signToken only writes strings. A token carrying the id as a
    // number is still accepted, since nothing in the token format rules one out.
    const idStr =
        typeof id === 'string'
            ? id
            : typeof id === 'number' && Number.isInteger(id)
              ? String(id)
              : null;
    if (!idStr || typeof displayName !== 'string') return null;
    return { id: idStr, displayName };
}
