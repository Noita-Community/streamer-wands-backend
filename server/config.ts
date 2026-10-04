// Configuration is read from a fixed list of environment variables, validated all at once, and
// returned as a frozen object. Nothing is read from a file implicitly. For each variable NAME,
// NAME_FILE may point at a file holding the value instead (Docker secrets convention).
//
// See PLAN.md, "Configuration", for what each variable is for.

import { readFileSync } from 'node:fs';
import { LOG_LEVELS, type LogLevel } from './log.ts';

// Secret values live here, keyed by the identity of their wrapper, rather than on the wrapper
// itself. A Secret instance therefore has no fields at all: nothing to see when it is logged,
// serialized, or expanded in a debugger.
const secretValues = new WeakMap<Secret, string>();

/**
 * Wraps a secret so it cannot end up in logs, JSON, or a debugger pane by accident.
 *
 * Pass the Secret itself through functions and call unwrap() only at the point of use,
 * directly in the argument to whatever needs the raw value. Never hold the unwrapped
 * string in a variable or pass it on.
 */
export class Secret {
    constructor(value: string) {
        secretValues.set(this, value);
    }
    unwrap(): string {
        return secretValues.get(this)!;
    }
    toString(): string {
        return '[secret]';
    }
    toJSON(): string {
        return '[secret]';
    }
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return '[secret]';
    }
}

export type Config = Readonly<{
    port: number;
    /** Origin the site is reached at, e.g. https://onlywands.com. No trailing slash. */
    publicUrl: string;
    twitchClientId: string;
    twitchClientSecret: Secret;
    jwtSecret: Secret;
    sessionSecret: Secret;
    dbPath: string;
    modDir: string;
    trustProxy: boolean;
    logLevel: LogLevel;
}>;

export class ConfigError extends Error {
    problems: string[];
    constructor(problems: string[]) {
        super(`invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
        this.name = 'ConfigError';
        this.problems = problems;
    }
}

type Env = Record<string, string | undefined>;
type ReadFile = (path: string) => string;

/**
 * `env` is always passed in; this module never reads process.env itself. The entry point passes
 * process.env, tests pass a plain object.
 */
export function loadConfig(
    env: Env,
    readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): Config {
    const problems: string[] = [];

    /** The value of NAME, or the contents of the file NAME_FILE points at. Empty counts as unset. */
    const raw = (name: string): string | undefined => {
        const direct = env[name];
        const file = env[`${name}_FILE`];
        if (direct !== undefined && direct !== '' && file) {
            problems.push(`${name} and ${name}_FILE are both set; use one`);
            return undefined;
        }
        if (file) {
            try {
                return readFile(file).trim() || undefined;
            } catch (err) {
                problems.push(`${name}_FILE: cannot read ${file}: ${(err as Error).message}`);
                return undefined;
            }
        }
        return direct === '' ? undefined : direct;
    };

    const required = (name: string): string => {
        const v = raw(name);
        if (v === undefined) problems.push(`${name} is required`);
        return v ?? '';
    };

    const port = (() => {
        const v = raw('PORT') ?? '3000';
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 65535)
            problems.push(`PORT must be an integer from 0 to 65535, got "${v}"`);
        return n;
    })();

    const publicUrl = (() => {
        const v = required('PUBLIC_URL');
        if (!v) return '';
        try {
            const url = new URL(v);
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                throw new Error('not http(s)');
            if (url.pathname !== '/' || url.search || url.hash) {
                problems.push(`PUBLIC_URL must be an origin with no path, got "${v}"`);
            }
            return url.origin;
        } catch {
            problems.push(`PUBLIC_URL must be an http(s) URL, got "${v}"`);
            return '';
        }
    })();

    const bool = (name: string, fallback: boolean): boolean => {
        const v = raw(name);
        if (v === undefined) return fallback;
        if (v === 'true' || v === '1') return true;
        if (v === 'false' || v === '0') return false;
        problems.push(`${name} must be true or false, got "${v}"`);
        return fallback;
    };

    const logLevel = (() => {
        const v = raw('LOG_LEVEL') ?? 'info';
        if (!(LOG_LEVELS as readonly string[]).includes(v)) {
            problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${v}"`);
            return 'info' as LogLevel;
        }
        return v as LogLevel;
    })();

    const config: Config = Object.freeze({
        port,
        publicUrl,
        twitchClientId: required('TWITCH_CLIENT_ID'),
        twitchClientSecret: new Secret(required('TWITCH_CLIENT_SECRET')),
        jwtSecret: new Secret(required('JWT_SECRET')),
        sessionSecret: new Secret(required('SESSION_SECRET')),
        dbPath: raw('DB_PATH') ?? '/data/onlywands.sqlite',
        modDir: raw('MOD_DIR') ?? './mod',
        trustProxy: bool('TRUST_PROXY', false),
        logLevel,
    });

    if (problems.length > 0) throw new ConfigError(problems);
    return config;
}
