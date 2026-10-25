import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import jwt from 'jsonwebtoken';

import { Secret } from '../server/config.ts';
import { signToken, verifyToken } from '../server/token.ts';

// Tests that mint tokens the way other code would need the raw value; production code never does.
const RAW = 'test-secret';
const SECRET = new Secret(RAW);

describe('mod token', () => {
    it('round-trips', () => {
        const token = signToken({ id: '12345678', displayName: 'DunkOrSlam' }, SECRET);
        assert.deepEqual(verifyToken(token, SECRET), {
            id: '12345678',
            displayName: 'DunkOrSlam',
        });
    });

    it('verifies a token shaped like the previous server minted them', () => {
        // routes/index.js: JWT.sign({ id, displayName }, JWT_SECRET) with jsonwebtoken defaults (HS256, iat, no exp)
        const legacy = jwt.sign({ id: '12345678', displayName: 'DunkOrSlam' }, RAW);
        assert.deepEqual(verifyToken(legacy, SECRET), {
            id: '12345678',
            displayName: 'DunkOrSlam',
        });
    });

    it('tolerates a numeric id by stringifying it', () => {
        const token = jwt.sign({ id: 12345678, displayName: 'x' }, RAW);
        assert.deepEqual(verifyToken(token, SECRET), { id: '12345678', displayName: 'x' });
    });

    it('rejects the wrong secret', () => {
        const token = signToken({ id: '1', displayName: 'x' }, SECRET);
        assert.equal(verifyToken(token, new Secret('other')), null);
    });

    it('rejects other algorithms, including none', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
            'base64url',
        );
        const body = Buffer.from(JSON.stringify({ id: '1', displayName: 'x' })).toString(
            'base64url',
        );
        assert.equal(verifyToken(`${header}.${body}.`, SECRET), null);
    });

    it('rejects tokens missing the expected claims', () => {
        assert.equal(verifyToken(jwt.sign({ displayName: 'x' }, RAW), SECRET), null);
        assert.equal(verifyToken(jwt.sign({ id: '', displayName: 'x' }, RAW), SECRET), null);
        assert.equal(verifyToken(jwt.sign({ id: '1' }, RAW), SECRET), null);
        assert.equal(verifyToken(jwt.sign('just a string', RAW), SECRET), null);
    });

    it('rejects garbage', () => {
        assert.equal(verifyToken('', SECRET), null);
        assert.equal(verifyToken('not.a.jwt', SECRET), null);
    });
});

describe('Secret', () => {
    it('gives the value back only through unwrap()', () => {
        assert.equal(new Secret('hunter2').unwrap(), 'hunter2');
    });

    it('does not expose the value when printed, serialized, or inspected', () => {
        const s = new Secret('hunter2');
        for (const shown of [
            String(s),
            `${s}`,
            JSON.stringify({ s }),
            inspect(s),
            inspect({ nested: { s } }),
        ]) {
            assert.ok(!shown.includes('hunter2'), shown);
            assert.ok(shown.includes('[secret]'), shown);
        }
    });

    it('has no own properties holding the value', () => {
        const s = new Secret('hunter2');
        assert.deepEqual(Reflect.ownKeys(s), []);
        assert.ok(!JSON.stringify(Object.entries(s)).includes('hunter2'));
    });
});
