// Websocket authentication for the mod.
//
// At login the server signs a JWT identifying the Twitch user and bakes it into
// the downloaded mod as token.lua. When the mod connects, that JWT is the URL path.
// Verifying it is the whole of "who is this socket".
//
// The format cannot change without every streamer downloading the mod again, because each
// installed copy carries its token: HS256, payload { id, displayName, iat }, no expiry.

import jwt from 'jsonwebtoken';

import type { Secret } from './config.ts';

export type Ticket = {
    /** Twitch user id, always a string */
    id: string;
    /** Display name at the time the ticket was minted; may be stale. The database row is authoritative. */
    displayName: string;
};

export function signTicket(ticket: Ticket, secret: Secret): string {
    return jwt.sign({ id: ticket.id, displayName: ticket.displayName }, secret.unwrap(), {
        algorithm: 'HS256',
    });
}

/** Returns the ticket, or null for anything that does not verify or does not carry the expected claims. */
export function verifyTicket(token: string, secret: Secret): Ticket | null {
    let payload: unknown;
    try {
        payload = jwt.verify(token, secret.unwrap(), { algorithms: ['HS256'] });
    } catch {
        return null;
    }
    if (typeof payload !== 'object' || payload === null) return null;
    const { id, displayName } = payload as Record<string, unknown>;
    // Twitch ids are strings, and signTicket only writes strings. A token carrying the id as a
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
