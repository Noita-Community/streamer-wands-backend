// Websocket authentication for the mod.
//
// At login the server signs a JWT identifying the Twitch user and bakes it into
// the downloaded mod as token.lua. When the mod connects, that JWT is the URL path.
// Verifying it is the whole of "who is this socket".
//
// Format is fixed by every installed mod: HS256, payload { id, displayName, iat },
// no expiry. Tokens minted by the previous server must keep verifying.

import jwt from 'jsonwebtoken'

export type Ticket = {
    /** Twitch user id, always a string */
    id: string
    /** Display name at the time the ticket was minted; may be stale. The database row is authoritative. */
    displayName: string
}

export function signTicket(ticket: Ticket, secret: string): string {
    return jwt.sign({ id: ticket.id, displayName: ticket.displayName }, secret, { algorithm: 'HS256' })
}

/** Returns the ticket, or null for anything that does not verify or does not carry the expected claims. */
export function verifyTicket(token: string, secret: string): Ticket | null {
    let payload: unknown
    try {
        payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    } catch {
        return null
    }
    if (typeof payload !== 'object' || payload === null) return null
    const { id, displayName } = payload as Record<string, unknown>
    // Twitch ids are strings. Tolerate a number in case an old token carried one, but never emit one.
    const idStr = typeof id === 'string' ? id : typeof id === 'number' && Number.isInteger(id) ? String(id) : null
    if (!idStr || idStr === '' || typeof displayName !== 'string') return null
    return { id: idStr, displayName }
}
