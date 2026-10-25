// How a wand's stats are worded, the links that open it in a simulator, and its sprite.

import { describe, expect, it } from 'vitest';

import type { Wand } from '../../server/schema.ts';
import { wandSprite } from '../../web/src/data.ts';
import { displayValue, simulatorUrl } from '../../web/src/Wand.tsx';

const wand: Wand = {
    sprite_file: 'data/items_gfx/wands/wand_0042.png',
    ui_name: 'wand',
    mana_max: 350,
    mana_charge_speed: 120.4,
    reload_time: 10,
    actions_per_round: 3,
    deck_capacity: 5,
    shuffle_deck_when_empty: true,
    spread_degrees: -2.5,
    speed_multiplier: 1.2,
    fire_rate_wait: 4,
    always_cast: [{ action_id: 'DAMAGE', uses_remaining: -1 }],
    deck: [
        { action_id: 'SPEED', uses_remaining: -1 },
        null,
        { action_id: 'BOMB', uses_remaining: 3 },
        // Not in the released base game, so the simulators do not know it.
        { action_id: 'HOOK', uses_remaining: -1 },
    ],
};

describe('displayValue', () => {
    it('words shuffle as yes or no', () => {
        expect(displayValue(wand, 'shuffle_deck_when_empty')).toBe('Yes');
        expect(
            displayValue({ ...wand, shuffle_deck_when_empty: false }, 'shuffle_deck_when_empty'),
        ).toBe('No');
    });

    it('converts cast delay and recharge time from frames to seconds', () => {
        expect(displayValue(wand, 'fire_rate_wait')).toBe('0.07');
        expect(displayValue(wand, 'reload_time')).toBe('0.17');
    });

    it('leaves always-cast spells out of the capacity', () => {
        expect(displayValue(wand, 'deck_capacity')).toBe(4);
        expect(displayValue({ ...wand, always_cast: [] }, 'deck_capacity')).toBe(5);
    });

    it('formats spread, speed and whole numbers', () => {
        expect(displayValue(wand, 'spread_degrees')).toBe('-2.5 DEG');
        expect(displayValue(wand, 'speed_multiplier')).toBe('x 1.20');
        expect(displayValue(wand, 'mana_max')).toBe('350');
        expect(displayValue(wand, 'mana_charge_speed')).toBe('120');
        expect(displayValue(wand, 'actions_per_round')).toBe('3');
    });
});

describe('simulatorUrl', () => {
    it('builds a link with the simulator’s parameter names and the raw stat values', () => {
        expect(simulatorUrl(wand, 'https://sim.example/?', (stat) => stat.sim)).toBe(
            'https://sim.example/?x=1&a=3&d=4&r=10&m=350&c=120.4&l=5&q=-2.5&v=1.2' +
                '&spells=SPEED%2C%2CBOMB%2C',
        );
    });

    it('uses the engine field name where a simulator has no name of its own', () => {
        expect(simulatorUrl(wand, 'https://old.example/?', (stat) => stat.oldSim ?? stat.key)).toBe(
            'https://old.example/?shuffle_deck_when_empty=1&actions_per_round=3&cast_delay=4' +
                '&reload_time=10&mana_max=350&mana_charge_speed=120.4&deck_capacity=5' +
                '&spread=-2.5&speed_multiplier=1.2&spells=SPEED%2C%2CBOMB%2C',
        );
    });

    it('leaves a gap for an empty slot and for a spell the simulators do not know', () => {
        const url = simulatorUrl(wand, '?', (stat) => stat.sim);
        expect(url.split('&spells=')[1]!.split('%2C')).toEqual(['SPEED', '', 'BOMB', '']);
    });
});

describe('wandSprite', () => {
    it('finds a sprite by its file name, whatever the directory', () => {
        const handgun = wandSprite('data/items_gfx/handgun.png');
        expect(handgun.image).not.toBe('');
        expect(wandSprite('mods/whatever/handgun.png').image).toBe(handgun.image);
        expect(handgun.animated).toBe(false);
    });

    it('falls back to the bomb wand for a sprite it does not have', () => {
        expect(wandSprite('mods/some_mod/unheard_of_wand.png').image).toBe(
            wandSprite('data/items_gfx/bomb_wand.png').image,
        );
    });

    it('marks the chainsaw as animated', () => {
        expect(wandSprite('data/items_gfx/chainsaw.png').animated).toBe(true);
    });
});
