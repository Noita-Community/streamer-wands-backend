// Frontend build. Sources live in web/, output goes to dist/web/:
//   pages/    the HTML pages, which the server sends with data written in (server/pages.ts)
//   static/   scripts, styles, fonts and images, with content hashes in the built filenames

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const web = resolve(import.meta.dirname, 'web');

export default defineConfig({
    root: web,
    build: {
        outDir: resolve(import.meta.dirname, 'dist/web'),
        emptyOutDir: true,
        // Everything a browser fetches goes under static/, apart from the pages themselves,
        // so that nginx can serve that directory as it is. The files in web/public/static/
        // land there too.
        assetsDir: 'static/assets',
        // The game data is a few megabytes of sprites and is expected to be large.
        chunkSizeWarningLimit: 4096,
        rolldownOptions: {
            input: {
                index: resolve(web, 'pages/index.html'),
                streamer: resolve(web, 'pages/streamer.html'),
                nostreamer: resolve(web, 'pages/nostreamer.html'),
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
