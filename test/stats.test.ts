import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { convertNoitaStats, decryptStats, statsXmlToLua } from '../server/stats.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

describe('stats', () => {
    // Samples 0 to 2 each have the Lua they must produce stored beside them.
    for (const i of [0, 1, 2]) {
        it(`converts _stats${i}.salakieli to its expected Lua`, async () => {
            const encrypted = readFileSync(fixture(`_stats${i}.salakieli`));
            const expected = readFileSync(fixture(`stats${i}.lua`), 'utf8');
            assert.equal(await convertNoitaStats(encrypted), expected);
        });
    }

    it('decrypts _stats3.salakieli to XML with stat entries', async () => {
        const xml = await decryptStats(readFileSync(fixture('_stats3.salakieli')));
        assert.match(xml, /<E key="/);
        const lua = statsXmlToLua(xml);
        assert.match(lua, /^stats = \{\["/);
        assert.ok(lua.split('\n').length > 100, 'expected a few hundred stat entries');
    });

    it('escapes quotes and backslashes in keys', () => {
        assert.equal(
            statsXmlToLua('<Stats><E key="a&quot;b\\c" value="1"/></Stats>'),
            'stats = {["a\\"b\\\\c"]=1}',
        );
    });

    it('finds entries at any depth and keeps document order', () => {
        const xml = '<Stats><stats><E key="b" value="2"/></stats><E key="a" value="1"/></Stats>';
        assert.equal(statsXmlToLua(xml), 'stats = {["b"]=2,\n["a"]=1}');
    });

    it('produces an empty table for no entries', () => {
        assert.equal(statsXmlToLua('<Stats/>'), 'stats = {}');
    });
});
