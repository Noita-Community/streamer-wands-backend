// The search box over each progress table: plain text against names and ids, and in the spells
// table, @ searches against tooltip stats.

import { describe, expect, it } from 'vitest';

import type { SpellInfo } from '../../web/src/data.ts';
import { matcher } from '../../web/src/Progress.tsx';

const spell = (meta: Record<string, number>): SpellInfo => ({
    name: 'x',
    description: '',
    sprite: '',
    meta,
});

const bomb = { id: 'BOMB', name: 'Bomb' };
const sparkBolt = { id: 'LIGHT_BULLET', name: 'Spark bolt' };

describe('matcher: plain text', () => {
    it('leaves everything alone when the search is empty', () => {
        expect(matcher('')(bomb, undefined)).toBe('neutral');
    });

    it('finds by name or by id, ignoring case', () => {
        expect(matcher('bomb')(bomb, undefined)).toBe('found');
        expect(matcher('BOLT')(sparkBolt, undefined)).toBe('found');
        expect(matcher('light_b')(sparkBolt, undefined)).toBe('found');
    });

    it('hides what does not match', () => {
        expect(matcher('bomb')(sparkBolt, undefined)).toBe('hidden');
    });

    it('matches anywhere in the text', () => {
        expect(matcher('om')(bomb, undefined)).toBe('found');
    });
});

describe('matcher: @ searches on spell stats', () => {
    const projectile = spell({ action_type: 0, fire_rate_wait: 3, action_mana_drain: 5 });
    const staticProjectile = spell({ action_type: 1, fire_rate_wait: 80 });
    const modifier = spell({ action_type: 2, fire_rate_wait: -10 });
    const noCastDelay = spell({ action_type: 6 });

    it('finds spells of a type by any part of its name', () => {
        const search = matcher('@type=static');
        expect(search(bomb, staticProjectile)).toBe('found');
        expect(search(bomb, projectile)).toBe('hidden');
        expect(matcher('@type=modifier')(bomb, modifier)).toBe('found');
    });

    it('compares a time typed in seconds against the stat', () => {
        // A cast delay of 3 frames is 0.05 seconds.
        expect(matcher('@cast delay>0.04')(bomb, projectile)).toBe('found');
        expect(matcher('@cast delay>0.06')(bomb, projectile)).toBe('hidden');
        expect(matcher('@cast delay<0')(bomb, modifier)).toBe('found');
        expect(matcher('@cast delay<0')(bomb, projectile)).toBe('hidden');
    });

    it('accepts a stat named by the start of its label', () => {
        expect(matcher('@cast<0')(bomb, modifier)).toBe('found');
        expect(matcher('@mana>4')(bomb, projectile)).toBe('found');
        expect(matcher('@mana>5')(bomb, projectile)).toBe('hidden');
    });

    it('finds every spell that has the stat when no comparison is given', () => {
        const search = matcher('@mana drain');
        expect(search(bomb, projectile)).toBe('found');
        expect(search(bomb, staticProjectile)).toBe('hidden');
    });

    it('hides spells that lack the stat', () => {
        expect(matcher('@cast<0')(bomb, noCastDelay)).toBe('hidden');
    });

    it('hides everything in a table whose entries are not spells', () => {
        expect(matcher('@cast<0')(bomb, undefined)).toBe('hidden');
    });

    it('compares damage typed in hit points against the stat', () => {
        // 0.5 game units of projectile damage is 12.5 hit points.
        const damaging = spell({ action_type: 0, action_projectile: 0.5 });
        expect(matcher('@damage>12')(bomb, damaging)).toBe('found');
        expect(matcher('@damage>13')(bomb, damaging)).toBe('hidden');
        expect(matcher('@damage<13')(bomb, damaging)).toBe('found');
        expect(matcher('@dmg. slice>10')(bomb, spell({ action_slice: 0.5 }))).toBe('found');
    });

    it('leaves everything alone while the search names no stat or is half typed', () => {
        for (const search of ['@nosuchstat', '@type=', '@cast>', '@damage<', '@(']) {
            expect(matcher(search)(bomb, projectile), search).toBe('neutral');
        }
    });
});
