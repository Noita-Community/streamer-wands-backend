// What the page makes of an inventory item: which ones it can show, and how it words what a
// container holds.

import { describe, expect, it } from 'vitest';

import type { ItemSlot } from '../../server/schema.ts';
import { describeItem } from '../../web/src/Item.tsx';

type Item = Extract<ItemSlot, { kind: 'item' }>;

const potion = (over: Partial<Item> = {}): Item => ({
    kind: 'item',
    ui_sprite: 'data/ui_gfx/items/potion.png',
    item_name: '$item_potion',
    ui_description: '$item_description_potion',
    color: 0xff0080ff,
    contents: [],
    ...over,
});

describe('describeItem', () => {
    it('describes an item with nothing in it by name alone', () => {
        const item = describeItem(potion(), false)!;
        expect(item.id).toBe('item_potion');
        expect(item.title).toBe('Potion');
        expect(item.description).toBe('Equip and throw');
        expect(item.contents).toEqual([]);
        // There is nothing to tint an empty container with.
        expect(item.color).toBeNull();
        expect(item.book).toBe(false);
    });

    it('lists contents as shares of the container, largest first', () => {
        const item = describeItem(
            potion({
                contents: [
                    { material: 'oil', ui_name: 'Oil', amount: 200 },
                    { material: 'water', ui_name: 'Water', amount: 425 },
                ],
            }),
            false,
        )!;
        // A potion holds 1000 units.
        expect(item.contents).toEqual([
            { material: 'water', ui_name: 'Water', percent: 42.5 },
            { material: 'oil', ui_name: 'Oil', percent: 20 },
        ]);
        expect(item.fullness).toBe(62.5);
        expect(item.title).toBe('Water+Oil Potion (62% full)');
        expect(item.color).toBe(0xff0080ff);
    });

    it('measures each kind of container by its own capacity', () => {
        const contents = [{ material: 'water', ui_name: 'Water', amount: 300 }];
        const percent = (over: Partial<Item>) =>
            describeItem(potion({ contents, ...over }), true)!.contents[0]!.percent;

        expect(percent({})).toBe(30);
        expect(percent({ ui_sprite: 'data/ui_gfx/items/potion_alchemist.png' })).toBe(60);
        expect(
            percent({
                ui_sprite: 'data/ui_gfx/items/material_pouch.png',
                item_name: '$item_powder_stash_3',
                ui_description: '$itemdesc_powder_stash_3',
            }),
        ).toBe(20);
    });

    it('marks tablets and books', () => {
        const tablet = describeItem(
            potion({
                ui_sprite: 'data/ui_gfx/items/emerald_tablet.png',
                item_name: '$booktitle01',
                ui_description: '$bookdesc01',
                color: null,
            }),
            false,
        )!;
        expect(tablet.book).toBe(true);
        expect(tablet.title).toBe('Emerald Tablet of Thoth');
    });

    it('shows nothing for an empty slot or a descriptor the server could not parse', () => {
        expect(describeItem(null, true)).toBeNull();
        expect(describeItem(undefined, true)).toBeNull();
        expect(describeItem({ kind: 'unparsed', raw: 'whatever$-1' }, true)).toBeNull();
    });

    it('shows nothing for an item, sprite or description the data does not have', () => {
        expect(describeItem(potion({ item_name: '$item_from_some_mod' }), true)).toBeNull();
        expect(
            describeItem(potion({ ui_sprite: 'data/ui_gfx/items/unknown.png' }), true),
        ).toBeNull();
        expect(describeItem(potion({ ui_description: '$no_such_description' }), true)).toBeNull();
    });

    it('finds the base game’s sprite for an item Apotheosis ships its own copy of', () => {
        const slot = potion({ ui_sprite: 'mods/Apotheosis/files/ui_gfx/items/potion.png' });
        expect(describeItem(slot, true)!.title).toBe('Potion');
    });

    it('hides anything from Apotheosis while Apotheosis content is off', () => {
        const fromTheMod = potion({ ui_sprite: 'mods/apotheosis/files/ui_gfx/items/potion.png' });
        expect(describeItem(fromTheMod, false)).toBeNull();

        const holdingItsMaterial = potion({
            contents: [{ material: 'apotheosis_redstone', ui_name: 'Redstone', amount: 100 }],
        });
        expect(describeItem(holdingItsMaterial, false)).toBeNull();
        expect(describeItem(holdingItsMaterial, true)).not.toBeNull();
    });
});
