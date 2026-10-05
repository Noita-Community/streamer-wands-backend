// Packs the mod/ tree, as it is now, into a release zip: releases/streamer_wands--<version>.zip,
// where the version is "modVersion" in package.json. The server hands out every zip in
// releases/ (server/releases.ts).
//
//   pnpm release
//
// Run it and commit the zip whenever the mod changes. Building the Docker image runs it too, so
// a deployment always carries the current mod even if the committed zip is stale.
//
// Earlier versions stay in releases/ for as long as they should remain downloadable, in case a
// new one turns out to be broken. Delete a zip to stop offering it.
//
// Packing the same files always produces the same bytes, so a zip only shows up as changed in
// git when the mod did change.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import JSZip from 'jszip';

import { releaseFilename } from '../server/releases.ts';

const root = join(import.meta.dirname, '..');
const modDir = join(root, 'mod');

/** Files in mod/ that are about the repository, not part of the mod. */
const LEFT_OUT = new Set(['.gitattributes']);

/** Every entry is stamped with this, not the time of packing, to keep the output repeatable. */
const ENTRY_DATE = new Date(Date.UTC(2000, 0, 1));

const { modVersion } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    modVersion?: unknown;
};
if (typeof modVersion !== 'string' || modVersion === '') {
    console.error('package.json has no "modVersion"');
    process.exit(1);
}

const paths = readdirSync(modDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(modDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((path) => !LEFT_OUT.has(path))
    .sort();

const zip = new JSZip();
for (const path of paths) {
    zip.file(`streamer_wands/${path}`, readFileSync(join(modDir, path)), {
        date: ENTRY_DATE,
        // Folder entries would be stamped with the current time.
        createFolders: false,
    });
}
const packed = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
});

const name = releaseFilename(modVersion);
writeFileSync(join(root, 'releases', name), packed);
console.log(`packed releases/${name}: ${paths.length} files, ${packed.length} bytes`);
