// How spell stats are worded in tooltips, and what stands in for a spell nobody knows.

import { describe, expect, it } from 'vitest';

import { dataset } from '../../web/src/data.ts';
import { formatStat, spellInfo } from '../../web/src/Spell.tsx';

describe('formatStat', () => {
    it('names the spell type', () => {
        expect(formatStat('action_type', 0)).toBe('Projectile');
        expect(formatStat('action_type', 2)).toBe('Proj. modifier');
        expect(formatStat('action_type', 7)).toBe('Passive');
    });

    it('lists nothing for a type it does not know', () => {
        expect(formatStat('action_type', 99)).toBeUndefined();
    });

    it('converts damage to hit points, rounding as the game does for each kind', () => {
        // 0.5 units is 12.5 hit points.
        expect(formatStat('action_projectile', 0.5)).toBe(13);
        expect(formatStat('action_fire', 0.5)).toBe(13);
        expect(formatStat('action_slice', 0.5)).toBe(12);
        expect(formatStat('action_explosion', 0.5)).toBe(12);
    });

    it('shows damage a modifier adds with its sign', () => {
        expect(formatStat('damage_projectile_add', 0.4)).toBe('+10');
        expect(formatStat('damage_projectile_add', -0.4)).toBe('-10');
        expect(formatStat('damage_explosion_add', 0.5)).toBe('+12');
        expect(formatStat('damage_ice_add', 0)).toBe('0');
    });

    it('converts frame counts to seconds, signed', () => {
        expect(formatStat('fire_rate_wait', 3)).toBe('+0.05 s');
        expect(formatStat('reload_time', -10)).toBe('-0.17 s');
        expect(formatStat('fire_rate_wait', 60)).toBe('+1.0 s');
        expect(formatStat('fire_rate_wait', 0)).toBe('0.0 s');
    });

    it('lists a speed multiplier only when it changes something', () => {
        expect(formatStat('speed_multiplier', 2.5)).toBe('x 2.50');
        expect(formatStat('speed_multiplier', 0.5)).toBe('x 0.50');
        expect(formatStat('speed_multiplier', 1)).toBeUndefined();
    });

    it('signs spread, bounces and critical chance', () => {
        expect(formatStat('spread_degrees', 6)).toBe('+6 DEG');
        expect(formatStat('spread_degrees', -1)).toBe('-1 DEG');
        expect(formatStat('bounces', 2)).toBe('+2');
        expect(formatStat('damage_critical_chance', 5)).toBe('+5%');
    });

    it('passes other stats through as they are', () => {
        expect(formatStat('action_mana_drain', 25)).toBe(25);
        expect(formatStat('explosion_radius', 60)).toBe(60);
    });
});

describe('spellInfo', () => {
    const data = dataset(false);

    it('finds a spell the data set has', () => {
        expect(spellInfo('BOMB', data).name).toBe('Bomb');
    });

    it('stands in for an unknown spell with its id and the placeholder sprite', () => {
        const info = spellInfo('SOME_MODDED_SPELL', data);
        expect(info.name).toBe('SOME_MODDED_SPELL');
        expect(info.sprite).toBe(data.missingSpell.image);
        expect(info.meta).toBeUndefined();
    });

    it('knows Apotheosis spells only in the Apotheosis data set', () => {
        const apotheosis = dataset(true);
        const onlyThere = Object.keys(apotheosis.spells).find((id) => !(id in data.spells))!;
        expect(spellInfo(onlyThere, apotheosis).sprite).not.toBe(apotheosis.missingSpell.image);
        expect(spellInfo(onlyThere, data).sprite).toBe(data.missingSpell.image);
    });
});
