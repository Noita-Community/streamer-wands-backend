import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { ConfigError, Secret, loadConfig } from '../server/config.ts';

const VALID = {
    PUBLIC_URL: 'https://onlywands.com',
    TWITCH_CLIENT_ID: 'client-id',
    TWITCH_CLIENT_SECRET: 'client-secret',
    JWT_SECRET: 'jwt-secret',
    SESSION_SECRET: 'session-secret',
};

const noFiles = (path: string): string => {
    throw new Error(`unexpected read of ${path}`);
};

const problemsOf = (env: Record<string, string | undefined>, readFile = noFiles): string[] => {
    try {
        loadConfig(env, readFile);
    } catch (err) {
        assert.ok(err instanceof ConfigError);
        return err.problems;
    }
    assert.fail('expected loadConfig to throw');
};

describe('loadConfig', () => {
    it('applies defaults for everything optional', () => {
        const c = loadConfig(VALID, noFiles);
        assert.equal(c.port, 3000);
        assert.equal(c.publicUrl, 'https://onlywands.com');
        assert.equal(c.dbPath, '/data/onlywands.sqlite');
        assert.equal(c.modDir, './mod');
        assert.equal(c.webDir, './dist/web');
        assert.equal(c.trustProxy, false);
        assert.equal(c.logLevel, 'info');
        assert.equal(c.twitchClientId, 'client-id');
    });

    it('wraps secrets and keeps them out of serialized config', () => {
        const c = loadConfig(VALID, noFiles);
        assert.ok(c.jwtSecret instanceof Secret);
        assert.equal(c.jwtSecret.unwrap(), 'jwt-secret');
        const shown = JSON.stringify(c);
        for (const secret of ['client-secret', 'jwt-secret', 'session-secret']) {
            assert.ok(!shown.includes(secret), shown);
        }
    });

    it('returns a frozen object', () => {
        const c = loadConfig(VALID, noFiles);
        assert.ok(Object.isFrozen(c));
    });

    it('reports every problem at once, not just the first', () => {
        const problems = problemsOf({ PORT: 'eighty', LOG_LEVEL: 'loud', TRUST_PROXY: 'maybe' });
        const text = problems.join('\n');
        for (const name of [
            'PORT',
            'LOG_LEVEL',
            'TRUST_PROXY',
            'PUBLIC_URL',
            'TWITCH_CLIENT_ID',
            'TWITCH_CLIENT_SECRET',
            'JWT_SECRET',
            'SESSION_SECRET',
        ]) {
            assert.match(text, new RegExp(name));
        }
    });

    it('treats an empty value as unset', () => {
        assert.match(problemsOf({ ...VALID, JWT_SECRET: '' }).join('\n'), /JWT_SECRET is required/);
    });

    it('reads NAME_FILE in place of NAME and trims it', () => {
        const env = { ...VALID, JWT_SECRET: undefined, JWT_SECRET_FILE: '/run/secrets/jwt' };
        const c = loadConfig(env, (path) => {
            assert.equal(path, '/run/secrets/jwt');
            return 'from-file\n';
        });
        assert.equal(c.jwtSecret.unwrap(), 'from-file');
    });

    it('refuses NAME and NAME_FILE together', () => {
        const problems = problemsOf({ ...VALID, JWT_SECRET_FILE: '/run/secrets/jwt' });
        assert.match(problems.join('\n'), /JWT_SECRET and JWT_SECRET_FILE are both set/);
    });

    it('reports an unreadable NAME_FILE', () => {
        const env = { ...VALID, JWT_SECRET: undefined, JWT_SECRET_FILE: '/nope' };
        assert.match(problemsOf(env).join('\n'), /JWT_SECRET_FILE: cannot read \/nope/);
    });

    it('requires PUBLIC_URL to be a bare http(s) origin', () => {
        for (const bad of ['onlywands.com', 'ftp://onlywands.com', 'https://onlywands.com/path']) {
            assert.match(problemsOf({ ...VALID, PUBLIC_URL: bad }).join('\n'), /PUBLIC_URL/);
        }
        assert.equal(
            loadConfig({ ...VALID, PUBLIC_URL: 'http://localhost:3000/' }, noFiles).publicUrl,
            'http://localhost:3000',
        );
    });

    it('parses booleans and ports', () => {
        const c = loadConfig({ ...VALID, TRUST_PROXY: 'true', PORT: '8080' }, noFiles);
        assert.equal(c.trustProxy, true);
        assert.equal(c.port, 8080);
        assert.match(problemsOf({ ...VALID, PORT: '70000' }).join('\n'), /PORT/);
    });
});
