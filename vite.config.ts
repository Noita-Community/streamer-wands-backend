// Frontend build. Sources live in web/, output goes to dist/web/ with content hashes in the
// asset filenames. The server serves that directory; see server/static.ts.

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const web = resolve(import.meta.dirname, 'web');

export default defineConfig({
    root: web,
    build: {
        outDir: resolve(import.meta.dirname, 'dist/web'),
        emptyOutDir: true,
        // The game data is a few megabytes of sprites and is expected to be large.
        chunkSizeWarningLimit: 4096,
        rolldownOptions: {
            input: {
                streamer: resolve(web, 'streamer.html'),
                nostreamer: resolve(web, 'nostreamer.html'),
            },
            output: {
                // The game data goes in a file of its own. It changes far less often than the
                // code, and this way a code change does not make browsers download it again.
                codeSplitting: {
                    groups: [{ name: 'game-data', test: /[\\/]web[\\/]data[\\/]/ }],
                },
            },
        },
    },
});
