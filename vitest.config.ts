// Test configuration. It exists so that the tests do not pick up vite.config.ts, which is
// rooted in web/ and builds the frontend.
//
// Files named *.integration.test.ts drive a real browser against the built page. They need
// Playwright's Chromium and are run on their own: `pnpm test` leaves them out, and
// `pnpm test:integration` runs only them.

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
    },
});
