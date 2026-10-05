// The mod downloads. Each release of the mod is a zip in the releases directory, named
// streamer_wands--<version>.zip and holding one folder, streamer_wands/, which is what the game
// expects to find in its mods directory. scripts/pack-mod.ts makes them, and they are committed.
//
// A download is one of those zips with the files that differ per streamer and per server added:
//
//   token.lua           the streamer's mod token
//   version.lua         the release's version, which the mod reports back
//   stats.lua           the streamer's kill statistics, when they uploaded their stats file
//   files/ws/host.lua   the websocket address of this server
//
// The release's own entries are copied into the download as they are, still compressed. Only
// the added files are compressed per download.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import semver from 'semver';

import { websocketOrigin } from './ws.ts';

const FOLDER = 'streamer_wands';
const RELEASE_FILE = /^streamer_wands--(.+)\.zip$/;

/** What a release zip of this version is called, in the releases directory and as a download. */
export const releaseFilename = (version: string): string => `${FOLDER}--${version}.zip`;

export type Personal = {
    /** The streamer's mod token */
    token: string;
    /** Lua source defining the `stats` table; null when the streamer uploaded no stats file */
    statsLua: string | null;
};

export type Releases = ReturnType<typeof loadReleases>;

export function loadReleases(options: {
    /** Directory holding the release zips */
    dir: string;
    /** Origin of this site, e.g. https://onlywands.com. The mod connects to it by websocket. */
    publicUrl: string;
}) {
    const { dir, publicUrl } = options;

    // Read once. The directory only changes with a new deployment.
    const zips = new Map<string, Buffer>();
    for (const name of readdirSync(dir)) {
        const version = RELEASE_FILE.exec(name)?.[1];
        if (!version) continue;
        // Versions are ordered by the rules of semantic versioning, so each has to be one.
        if (!semver.valid(version)) {
            throw new Error(`${join(dir, name)}: "${version}" is not a semantic version`);
        }
        zips.set(version, readFileSync(join(dir, name)));
    }
    if (zips.size === 0) throw new Error(`no mod releases in ${dir}`);

    // The mod appends its token to make the full address.
    const hostLua = [
        'local token = dofile("mods/streamer_wands/token.lua")',
        `HOST_URL = "${websocketOrigin(publicUrl)}/" .. token`,
        '',
    ].join('\n');

    return {
        /** Every version there is, newest first. */
        versions: semver.rsort([...zips.keys()]),

        /** The download of one version for one streamer; null if there is no such version. */
        async build(version: string, { token, statsLua }: Personal): Promise<Buffer | null> {
            const release = zips.get(version);
            if (!release) return null;
            const zip = await JSZip.loadAsync(release);
            zip.file(`${FOLDER}/token.lua`, `return "${token}"`);
            zip.file(`${FOLDER}/version.lua`, `return "${version}"`);
            zip.file(`${FOLDER}/stats.lua`, statsLua ?? 'stats = {}');
            zip.file(`${FOLDER}/files/ws/host.lua`, hostLua);
            // DEFLATE is how the releases are compressed, and naming it here is what makes
            // JSZip copy their entries through untouched rather than inflate them.
            return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        },
    };
}
