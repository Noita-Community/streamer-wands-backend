import { afterEach, beforeEach, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadReleases } from '../server/releases.ts';

describe('releases', () => {
    let dir = '';
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'onlywands-releases-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    // Loading only reads the files; their contents matter when a download is built.
    const add = (name: string) => writeFileSync(join(dir, name), '');
    const load = () => loadReleases({ dir, publicUrl: 'https://example.com' });

    it('lists versions newest first, by the rules of semantic versioning', () => {
        for (const version of ['1.2.9', '1.2.10', '1.2.10-beta', '1.2.10-beta.2', '1.10.0']) {
            add(`streamer_wands--${version}.zip`);
        }
        assert.deepEqual(load().versions, [
            '1.10.0',
            '1.2.10',
            '1.2.10-beta.2',
            '1.2.10-beta',
            '1.2.9',
        ]);
    });

    it('takes no notice of other files', () => {
        add('streamer_wands--1.0.0.zip');
        add('README.md');
        add('something-else.zip');
        assert.deepEqual(load().versions, ['1.0.0']);
    });

    it('refuses to start with a release whose version it cannot order', () => {
        add('streamer_wands--latest.zip');
        assert.throws(load, /"latest" is not a semantic version/);
    });

    it('refuses to start with no releases at all', () => {
        assert.throws(load, /no mod releases/);
    });

    it('has nothing to build for a version it does not have', async () => {
        add('streamer_wands--1.0.0.zip');
        assert.equal(await load().build('2.0.0', { token: 't', statsLua: null }), null);
    });
});
