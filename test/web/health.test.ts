// How the player's health is worded. Health arrives as strings in game units, 25 hit points
// each, and has to survive values far beyond what a number holds.

import { describe, expect, it } from 'vitest';

import { describeHealth } from '../../web/src/Player.tsx';

describe('describeHealth', () => {
    it('shows ordinary health in hit points', () => {
        expect(describeHealth({ hp: '5.34', max_hp: '6.4' })).toEqual({
            infinite: false,
            hp: '133.5',
            maxHp: '160',
            shortHp: '133.5',
            shortMaxHp: '160',
        });
    });

    it('abbreviates large health in the short form and writes it out in the full form', () => {
        const health = describeHealth({ hp: '4000', max_hp: '80000' });
        expect(health.hp).toBe('100,000');
        expect(health.shortHp).toBe('100K');
        expect(health.maxHp).toBe('2,000,000');
        expect(health.shortMaxHp).toBe('2M');
        expect(health.infinite).toBe(false);
    });

    it('keeps every digit of a value given in exponent form', () => {
        // 1.5e15 game units is 3.75e16 hit points, beyond what a double holds exactly.
        const health = describeHealth({ hp: '1.5e+15', max_hp: '1.5e+15' });
        expect(health.hp).toBe('37,500,000,000,000,000');
        expect(health.infinite).toBe(false);
    });

    it('switches to scientific notation from 10^18 game units', () => {
        const health = describeHealth({ hp: '5e+18', max_hp: '5e+18' });
        expect(health.hp).toBe('1.25E20');
        expect(health.infinite).toBe(false);
    });

    it('reports infinity once either value passes what the game can count', () => {
        // The game's counter is a signed 64-bit integer: 2^63 is about 9.22e18.
        expect(describeHealth({ hp: '9.3e+18', max_hp: '9.3e+18' }).infinite).toBe(true);
        expect(describeHealth({ hp: '4', max_hp: '2e+20' }).infinite).toBe(true);
        expect(describeHealth({ hp: '9.2e+18', max_hp: '9.2e+18' }).infinite).toBe(false);
    });

    it('passes the engine’s own non-numbers through, labelled', () => {
        expect(describeHealth({ hp: 'inf', max_hp: 'inf' })).toEqual({
            infinite: false,
            hp: 'Engine inf',
            maxHp: 'Engine inf',
            shortHp: 'Engine inf',
            shortMaxHp: 'Engine inf',
        });
        expect(describeHealth({ hp: '-nan(ind)', max_hp: '4' }).hp).toBe('Engine -nan(ind)');
        expect(describeHealth({ hp: '4', max_hp: 'NaN' }).maxHp).toBe('Engine NaN');
    });

    it('treats values at the top of the double range as the engine’s too', () => {
        expect(describeHealth({ hp: '1e+308', max_hp: '1e+308' }).hp).toBe('Engine 1e+308');
    });
});
