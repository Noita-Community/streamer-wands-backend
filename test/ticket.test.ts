import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

import { signTicket, verifyTicket } from '../server/ticket.ts'

const SECRET = 'test-secret'

describe('ticket', () => {
    it('round-trips', () => {
        const token = signTicket({ id: '12345678', displayName: 'DunkOrSlam' }, SECRET)
        assert.deepEqual(verifyTicket(token, SECRET), { id: '12345678', displayName: 'DunkOrSlam' })
    })

    it('verifies a token shaped like the previous server minted them', () => {
        // routes/index.js: JWT.sign({ id, displayName }, JWT_SECRET) with jsonwebtoken defaults (HS256, iat, no exp)
        const legacy = jwt.sign({ id: '12345678', displayName: 'DunkOrSlam' }, SECRET)
        assert.deepEqual(verifyTicket(legacy, SECRET), { id: '12345678', displayName: 'DunkOrSlam' })
    })

    it('tolerates a numeric id by stringifying it', () => {
        const token = jwt.sign({ id: 12345678, displayName: 'x' }, SECRET)
        assert.deepEqual(verifyTicket(token, SECRET), { id: '12345678', displayName: 'x' })
    })

    it('rejects the wrong secret', () => {
        const token = signTicket({ id: '1', displayName: 'x' }, SECRET)
        assert.equal(verifyTicket(token, 'other'), null)
    })

    it('rejects other algorithms, including none', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
        const body = Buffer.from(JSON.stringify({ id: '1', displayName: 'x' })).toString('base64url')
        assert.equal(verifyTicket(`${header}.${body}.`, SECRET), null)
    })

    it('rejects tokens missing the expected claims', () => {
        assert.equal(verifyTicket(jwt.sign({ displayName: 'x' }, SECRET), SECRET), null)
        assert.equal(verifyTicket(jwt.sign({ id: '' , displayName: 'x' }, SECRET), SECRET), null)
        assert.equal(verifyTicket(jwt.sign({ id: '1' }, SECRET), SECRET), null)
        assert.equal(verifyTicket(jwt.sign('just a string', SECRET), SECRET), null)
    })

    it('rejects garbage', () => {
        assert.equal(verifyTicket('', SECRET), null)
        assert.equal(verifyTicket('not.a.jwt', SECRET), null)
    })
})
