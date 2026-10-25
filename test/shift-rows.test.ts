// How shifts chain follows a quirk of the game that is easy to "correct" by accident. This file
// holds a reference implementation whose results are known to match the game, and requires
// computeRows to agree with it over the same shift sequences.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { computeRows, type ShiftKind, type ShiftPairs } from '../web/src/shift-rows.ts';

// --------------------------------------------------------------------------------------------
// The reference implementation. It is the calculation the site used for years, kept statement
// for statement so that it stays a trustworthy record of the behaviour; do not tidy it. It
// works on a different representation from computeRows: a material is one "id%@%name" string,
// a shift is a flat array alternating input and output, and a cause is a cell index, two per
// row. The fungal and creature calculations differ only in the body of the final loop, which
// the `creature` flag selects.

const HOP = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/* eslint-disable */
function referenceShiftInfo(shifts: string[][], nShifts: number, creature: boolean): any[] {
    const transformed: any = {};
    const lastShift: any = {};
    const sequence: any[] = [];

    let shiftsAll: any[] = [];
    for (let i = 0; i < nShifts; i++) {
        const shift = shifts[i]!;
        shiftsAll.push(
            shift.map((material, ioNumber) => {
                if (ioNumber % 2) {
                    return material;
                }
                const letter = shift.length > 2 ? String.fromCharCode(97 + ioNumber / 2) : '';
                return [i + 1 + letter, material];
            }),
        );
    }
    shiftsAll = shiftsAll.flat(Infinity);

    let j = 0;
    for (let i = 0; i < shiftsAll.length - 1; i += 3) {
        const shiftNumber = shiftsAll[i];
        const input = shiftsAll[i + 1];
        const original = shiftsAll[i + 2];
        const final = transformed[original] ?? { mat: original };
        transformed[input] = {
            mat: final.mat,
            j,
        };

        const shift: any = {
            shiftNumber,
            input,
            output: {
                original,
                final: final.mat,
            },
            extra: { atShift: null, now: null },
            cause: { output: null, extra: null },
            isOverwritten: false,
            j,
        };
        if (HOP(transformed, original)) {
            shift.cause.output = transformed[original].j;
        }

        // Fungal only. `final` is an object here, not a material string, so this lookup
        // never matches and the statement has no effect.
        if (!creature && HOP(transformed, final) && transformed[final] !== final) {
            shift.extra.atShift = transformed[final].mat;
        }

        if (HOP(lastShift, input)) {
            lastShift[input].isOverwritten = true;
        }
        lastShift[input] = shift;

        sequence.push(shift);
        j += 2;
    }

    for (let i = 0; i < sequence.length; i++) {
        const shift = sequence[i];
        const final = shift.output.final;
        if (HOP(transformed, final) && transformed[final].mat !== final) {
            if (creature) {
                shift.output.final = transformed[final].mat;
                shift.cause.output = transformed[final].j;
            } else {
                shift.extra.now = transformed[final].mat;
                shift.cause.extra = transformed[final].j;
            }
        }
    }

    return sequence;
}
/* eslint-enable */

// --------------------------------------------------------------------------------------------

const material = (id: string) => ({ id, ui_name: id.toUpperCase() });
const legacy = (id: string) => `${id}%@%${id.toUpperCase()}`;
const idOf = (legacyMaterial: string | null) => legacyMaterial?.split('%@%')[0] ?? null;

/** Runs both implementations on the same shifts and requires the same rows from each. */
function compare(shifts: [string, string][][], upTo: number, kind: ShiftKind) {
    const pairs: ShiftPairs[] = shifts.map((shift) =>
        shift.map(([from, to]) => ({ from: material(from), to: material(to) })),
    );
    const flat = shifts.map((shift) => shift.flatMap(([from, to]) => [legacy(from), legacy(to)]));

    const actual = computeRows(pairs, upTo, kind).map((row) => ({
        label: row.label,
        input: row.input.id,
        original: row.original.id,
        final: row.final.id,
        now: row.now?.id ?? null,
        causeOfFinal: row.causeOfFinal,
        causeOfNow: row.causeOfNow,
        overwritten: row.overwritten,
    }));
    const expected = referenceShiftInfo(flat, Math.min(upTo, flat.length), kind === 'creature').map(
        (shift) => ({
            label: String(shift.shiftNumber),
            input: idOf(shift.input),
            original: idOf(shift.output.original),
            final: idOf(shift.output.final),
            now: idOf(shift.extra.now),
            causeOfFinal: shift.cause.output === null ? null : shift.cause.output >> 1,
            causeOfNow: shift.cause.extra === null ? null : shift.cause.extra >> 1,
            overwritten: shift.isOverwritten,
        }),
    );
    assert.deepEqual(actual, expected);
    return actual;
}

/** Deterministic pseudo-random numbers, so a failure can be reproduced. */
function generator(seed: number) {
    let state = seed;
    return (limit: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state % limit;
    };
}

describe('computeRows', () => {
    for (const kind of ['fungal', 'creature'] as const) {
        it(`matches the reference ${kind} calculation on a simple chain`, () => {
            const rows = compare(
                [[['water', 'oil']], [['oil', 'lava']], [['lava', 'blood']]],
                3,
                kind,
            );
            assert.equal(rows.length, 3);
        });

        it(`matches the reference ${kind} calculation when a material is shifted twice`, () => {
            compare([[['water', 'oil']], [['water', 'lava']], [['oil', 'water']]], 3, kind);
        });

        it(`matches the reference ${kind} calculation for a shift into itself and cycles`, () => {
            compare([[['water', 'water']]], 1, kind);
            compare([[['a', 'b']], [['b', 'a']], [['a', 'b']]], 3, kind);
            compare([[['a', 'b']], [['b', 'c']], [['c', 'a']], [['a', 'd']]], 4, kind);
        });

        it(`matches the reference ${kind} calculation for shifts converting several materials`, () => {
            compare(
                [
                    [
                        ['water', 'oil'],
                        ['sand', 'oil'],
                    ],
                    [['oil', 'lava']],
                    [
                        ['lava', 'water'],
                        ['blood', 'sand'],
                        ['acid', 'oil'],
                    ],
                ],
                3,
                kind,
            );
        });

        it(`matches the reference ${kind} calculation when only the first N shifts are used`, () => {
            const shifts: [string, string][][] = [
                [['a', 'b']],
                [['b', 'c']],
                [['c', 'd']],
                [['d', 'a']],
            ];
            for (let upTo = 0; upTo <= shifts.length; upTo++) compare(shifts, upTo, kind);
        });

        it(`matches the reference ${kind} calculation on 2000 generated sequences`, () => {
            // A small pool of materials makes chains, repeats and cycles common.
            const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
            for (let seed = 1; seed <= 2000; seed++) {
                const next = generator(seed);
                const shifts: [string, string][][] = Array.from({ length: 1 + next(12) }, () =>
                    Array.from({ length: next(5) === 0 ? 2 + next(2) : 1 }, () => [
                        pool[next(pool.length)]!,
                        pool[next(pool.length)]!,
                    ]),
                );
                compare(shifts, 1 + next(shifts.length), kind);
            }
        });
    }
});
