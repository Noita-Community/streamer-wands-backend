// The calculation behind the shifts table.
//
// A shift turns one material into another, everywhere, for the rest of the run. Shifts chain:
// if water becomes oil and later oil becomes lava, then water is now lava too.
//
// The chaining is not a full transitive closure, and must not be made into one. It follows what
// the game itself does: when a shift is made, what its output has already become is looked up
// once, at that moment, and that result is never revisited. A later shift does not go back and
// change the outcome of an earlier one; its effect on an earlier result is reported separately,
// as `now`.
//
// test/shift-rows.test.ts holds a reference implementation and requires this one to agree with
// it on thousands of generated shift sequences.

import type { Material, Shift } from '../../server/schema.ts';

export type ShiftKind = 'fungal' | 'creature';

/** One shift's conversions. A single shift can convert several materials at once. */
export type ShiftPairs = NonNullable<Shift>;

export type Row = {
    /** "3", or "3a", "3b" when one shift converted several materials */
    label: string;
    input: Material;
    /** What the shift itself turned the input into */
    original: Material;
    /** What the input became at the time of the shift, given what `original` had become */
    final: Material;
    /** Fungal only: what `final` has since been shifted into, which changes its effects */
    now: Material | null;
    /** Index of the row whose shift is the reason `final` differs from `original` */
    causeOfFinal: number | null;
    /** Index of the row whose shift produced `now` */
    causeOfNow: number | null;
    /** A later shift of the same input replaced this one */
    overwritten: boolean;
};

/**
 * Work out the rows of the table from the first `upTo` shifts. `shifts` holds only the shifts
 * the mod could read; they are numbered by their position in that list.
 */
export function computeRows(shifts: ShiftPairs[], upTo: number, kind: ShiftKind): Row[] {
    /** material id -> what it became when it was last shifted, and the row that did it */
    const shifted = new Map<string, { material: Material; row: number }>();
    const latestFor = new Map<string, Row>();
    const rows: Row[] = [];

    for (let n = 0; n < Math.min(upTo, shifts.length); n++) {
        const pairs = shifts[n]!;
        pairs.forEach(({ from, to }, k) => {
            const index = rows.length;
            // One lookup, now. If `to` was itself shifted earlier, the input becomes that.
            const final = shifted.get(to.id)?.material ?? to;
            shifted.set(from.id, { material: final, row: index });
            const row: Row = {
                label: `${n + 1}${pairs.length > 1 ? String.fromCharCode(97 + k) : ''}`,
                input: from,
                original: to,
                final,
                now: null,
                // Looked up after this shift has been recorded, so that a material shifted
                // into itself names its own row as the cause.
                causeOfFinal: shifted.get(to.id)?.row ?? null,
                causeOfNow: null,
                overwritten: false,
            };
            const earlier = latestFor.get(from.id);
            if (earlier) earlier.overwritten = true;
            latestFor.set(from.id, row);
            rows.push(row);
        });
    }

    // What each row's result has been shifted into since, using the final state of the table.
    for (const row of rows) {
        const later = shifted.get(row.final.id);
        if (!later || later.material.id === row.final.id) continue;
        if (kind === 'fungal') {
            row.now = later.material;
            row.causeOfNow = later.row;
        } else {
            row.final = later.material;
            row.causeOfFinal = later.row;
        }
    }
    return rows;
}
