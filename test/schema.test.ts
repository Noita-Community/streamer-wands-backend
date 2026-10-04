import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    SCHEMA_VERSION,
    fromWire,
    migrate,
    parseItemSlot,
    parseShift,
    parseSpellSlot,
    parseStartTime,
} from '../server/schema.ts';

const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const GENERATIONS = [
    'current-minimal',
    'current-full',
    'current-apotheosis',
    'middle-generation',
    'oldest-array',
];

describe('fromWire', () => {
    for (const gen of GENERATIONS) {
        it(`converts the ${gen} wire shape to canonical`, () => {
            assert.deepEqual(fromWire(fixture(`wire-${gen}`)), fixture(`canonical-${gen}`));
        });
    }

    it('rejects things that are not snapshots', () => {
        assert.equal(fromWire(null), null);
        assert.equal(fromWire('im alive'), null);
        assert.equal(fromWire(42), null);
    });

    it('accepts an empty object as an empty snapshot', () => {
        const snap = fromWire({});
        assert.ok(snap);
        assert.deepEqual(snap.wands, []);
        assert.equal(snap.run, null);
        assert.equal(snap.player, null);
    });

    it('drops wands that are not [stats, always_cast, deck]', () => {
        const snap = fromWire({ wands: [null, 'x', [{ sprite: 'a' }, [], []], [1, 2, 3]] });
        assert.equal(snap?.wands.length, 1);
        assert.equal(snap?.wands[0]?.sprite_file, 'a');
    });
});

describe('parseSpellSlot', () => {
    it('splits id and charges on the last _#', () => {
        assert.deepEqual(parseSpellSlot('LIGHT_BULLET_#-1'), {
            action_id: 'LIGHT_BULLET',
            uses_remaining: -1,
        });
        assert.deepEqual(parseSpellSlot('BOMB_#3'), { action_id: 'BOMB', uses_remaining: 3 });
        assert.deepEqual(parseSpellSlot('WEIRD_#_#2'), { action_id: 'WEIRD_#', uses_remaining: 2 });
    });
    it('treats "0" as an empty slot', () => {
        assert.equal(parseSpellSlot('0'), null);
    });
    it('reports charges as unknown for a bare id from an older mod', () => {
        assert.deepEqual(parseSpellSlot('LIGHT_BULLET'), {
            action_id: 'LIGHT_BULLET',
            uses_remaining: null,
        });
    });
});

describe('parseItemSlot', () => {
    const item = (
        over: Partial<Extract<NonNullable<ReturnType<typeof parseItemSlot>>, { kind: 'item' }>>,
    ) => ({
        kind: 'item',
        ui_sprite: 'data/ui_gfx/items/potion.png',
        item_name: '$item_potion',
        ui_description: '$item_description_potion',
        color: null,
        contents: [],
        ...over,
    });

    it('parses a potion with contents', () => {
        assert.deepEqual(
            parseItemSlot(
                'data/ui_gfx/items/potion.png$item_potion$item_description_potion$123@Water (water)#5',
            ),
            item({ color: 123, contents: [{ material: 'water', ui_name: 'Water', amount: 5 }] }),
        );
    });

    it('parses an empty container', () => {
        assert.deepEqual(
            parseItemSlot('data/ui_gfx/items/beer_bottle.png$item_beer$item_description_beer$-1'),
            item({
                ui_sprite: 'data/ui_gfx/items/beer_bottle.png',
                item_name: '$item_beer',
                ui_description: '$item_description_beer',
            }),
        );
    });

    it('parses material names with spaces and untranslated $ keys', () => {
        assert.deepEqual(
            parseItemSlot(
                'data/ui_gfx/items/potion.png$item_potion$item_description_potion$0@concentrated mana (magic_liquid_mana_regeneration)#387@$mat_blood_fungi (blood_fungi)#1',
            ),
            item({
                color: 0,
                contents: [
                    {
                        material: 'magic_liquid_mana_regeneration',
                        ui_name: 'concentrated mana',
                        amount: 387,
                    },
                    { material: 'blood_fungi', ui_name: '$mat_blood_fungi', amount: 1 },
                ],
            }),
        );
    });

    it('keeps descriptors that do not split into sprite, name, description, colour', () => {
        // Literal (non-key) names or descriptions from modded items fuse with their neighbours. Today's
        // page cannot show these either; a proper serialization is future mod work.
        for (const raw of [
            'default_gun$-1',
            'data/ui_gfx/items/emerald_tablet.pngMysterious TabletKnowledge lies within.$-1',
            'data/ui_gfx/items/potion.png$item_potionCapacity: 1000 pixels\nEquip and throw$4278190211@blood (blood)#887',
            'a.png$n$d$notacolor',
            'a.png$n$d$1@broken',
        ]) {
            assert.deepEqual(parseItemSlot(raw), { kind: 'unparsed', raw });
        }
    });

    it('treats "0" as an empty slot', () => {
        assert.equal(parseItemSlot('0'), null);
    });
});

describe('parseShift', () => {
    it('pairs materials as from, to', () => {
        assert.deepEqual(parseShift('a%@%A<,>b%@%B<,>c%@%C<,>b%@%B'), [
            { from: { id: 'a', ui_name: 'A' }, to: { id: 'b', ui_name: 'B' } },
            { from: { id: 'c', ui_name: 'C' }, to: { id: 'b', ui_name: 'B' } },
        ]);
    });
    it('falls back to the id as the name when there is no %@%', () => {
        assert.deepEqual(parseShift('a<,>b'), [
            { from: { id: 'a', ui_name: 'a' }, to: { id: 'b', ui_name: 'b' } },
        ]);
    });
    it('maps "empty" to null', () => {
        assert.equal(parseShift('empty'), null);
    });
});

describe('parseStartTime', () => {
    it('reads the mod’s comma-separated UTC parts with a zero-based month', () => {
        assert.equal(parseStartTime('2026,0,1,0,0,0'), Date.UTC(2026, 0, 1));
    });
    it('returns null for empty or malformed input', () => {
        assert.equal(parseStartTime(''), null);
        assert.equal(parseStartTime('2026,1'), null);
        assert.equal(parseStartTime('x,y,z,a,b,c'), null);
    });
});

describe('migrate', () => {
    it('returns a current-version snapshot unchanged', () => {
        const snap = fixture('canonical-current-full');
        assert.deepEqual(migrate(snap, SCHEMA_VERSION), snap);
    });
    it('refuses a version newer than this build understands', () => {
        assert.throws(() => migrate({}, SCHEMA_VERSION + 1), /newer/);
    });
    it('refuses a version that is not a positive integer', () => {
        for (const bad of [0, -1, 1.5, NaN]) {
            assert.throws(() => migrate({}, bad), /invalid schema version/);
        }
    });
    it('refuses stored data that is not an object', () => {
        for (const bad of [null, 'text', 42, []]) {
            assert.throws(() => migrate(bad, SCHEMA_VERSION), /not an object/);
        }
    });
});
