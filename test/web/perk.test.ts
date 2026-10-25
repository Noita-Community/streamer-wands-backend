// What the page shows for a perk, given the id the game reported for it.

import { describe, expect, it } from 'vitest';

import { dataset } from '../../web/src/data.ts';
import { resolvePerk } from '../../web/src/Player.tsx';

const base = dataset(false);
const apotheosis = dataset(true);

const SHIFTED_INTO = '$status_apotheosis_creature_shifted_name_';

describe('resolvePerk', () => {
    it('finds a perk by the translation key the game reports', () => {
        const { icon, shift } = resolvePerk('$perk_extra_hp', base);
        expect(icon.id).toBe('EXTRA_HP');
        expect(icon.name).toBe('Extra Health (One-off)');
        expect(shift).toBeNull();
    });

    it('finds the things that sit among perks without being perks', () => {
        expect(resolvePerk('$item_essence_air', base).icon.name).toBe('Essence of Air');
    });

    it('stands in for an unknown perk, keeping the id it was reported under', () => {
        const { icon, shift } = resolvePerk('$perk_from_some_mod', base);
        expect(icon.name).toBe('No perk found');
        expect(icon.id).toBe('$perk_from_some_mod');
        expect(shift).toBeNull();
    });

    it('recognises a creature shift and names the creature to draw', () => {
        const id = `${SHIFTED_INTO}sheep`;
        const { icon, shift } = resolvePerk(id, apotheosis);
        expect(icon.name).toBe('The evolution has shifted');
        expect(icon.id).toBe(id);
        expect(shift?.creature.id).toBe('sheep');
        expect(shift?.frame.id).toBe('creature_shift_ui');
    });

    it('shows the empty frame for a shift into a creature it has no sprite for', () => {
        const { icon, shift } = resolvePerk(`${SHIFTED_INTO}no_such_creature`, apotheosis);
        expect(icon.name).toBe('The evolution has shifted');
        expect(shift).toBeNull();
    });

    it('prefers a ready-made icon for a creature shift when the data has one', () => {
        const id = `${SHIFTED_INTO}creature_shift_ui_backup`;
        const { icon, shift } = resolvePerk(id, apotheosis);
        expect(icon.id).toBe(id);
        expect(shift).toBeNull();
    });

    it('does not know creature shifts outside the Apotheosis data set', () => {
        expect(resolvePerk(`${SHIFTED_INTO}sheep`, base).icon.name).toBe('No perk found');
    });
});
