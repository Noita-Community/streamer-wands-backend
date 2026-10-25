// Minimal levelled logger with one uniform shape: every entry is an object with a `message`
// field, written as one line of JSON with `time` and `level` added.
//
//   log.info({ message: 'listening', port: 3000 });
//   log.error({ message: 'request failed', err });
//
// Error values anywhere in an entry are expanded to include their stack; without it the
// entry says something went wrong but not where.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogEntry = { message: string } & Record<string, unknown>;
export type Logger = Record<LogLevel, (entry: LogEntry) => void>;

type SerializedError = { name: string; message: string; stack?: string; cause?: unknown };

function serializeError(err: Error): SerializedError {
    const out: SerializedError = { name: err.name, message: err.message };
    if (err.stack !== undefined) out.stack = err.stack;
    if (err.cause !== undefined)
        out.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause;
    return out;
}

/** JSON.stringify replacer: Errors do not serialize on their own, and bigints throw. */
const replacer = (_key: string, value: unknown): unknown => {
    if (value instanceof Error) return serializeError(value);
    if (typeof value === 'bigint') return value.toString();
    return value;
};

export function createLogger(level: LogLevel, write: (line: string) => void = console.log): Logger {
    const threshold = LOG_LEVELS.indexOf(level);
    const at =
        (lvl: LogLevel) =>
        (entry: LogEntry): void => {
            if (LOG_LEVELS.indexOf(lvl) < threshold) return;
            write(
                JSON.stringify({ time: new Date().toISOString(), level: lvl, ...entry }, replacer),
            );
        };
    return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

export const silentLogger: Logger = createLogger('error', () => {});
