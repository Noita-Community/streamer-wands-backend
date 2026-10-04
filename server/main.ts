// Entry point: read configuration, open the database, listen.

import { createApp } from './app.ts';
import { ConfigError, loadConfig, type Config } from './config.ts';
import { openDb } from './db.ts';
import { createLogger } from './log.ts';

let config: Config;
try {
    config = loadConfig(process.env);
} catch (err) {
    if (err instanceof ConfigError) {
        console.error(err.message);
        process.exit(1);
    }
    throw err;
}

const log = createLogger(config.logLevel);
// Secrets serialize as "[secret]"; everything else is shown so a deployment's settings are
// visible at startup.
log.info({ message: 'configuration', ...config });

const db = openDb(config.dbPath, log);
const app = createApp({ db, jwtSecret: config.jwtSecret, log });

app.server.listen(config.port, () => {
    log.info({ message: 'listening', port: config.port, public_url: config.publicUrl });
});

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
        if (stopping) return;
        stopping = true;
        log.info({ message: 'shutting down', signal });
        app.close().then(
            () => {
                db.close();
                process.exit(0);
            },
            (err) => {
                log.error({ message: 'shutdown failed', err });
                process.exit(1);
            },
        );
    });
}
