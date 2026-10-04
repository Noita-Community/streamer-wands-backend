// Shared helpers for tests.

import assert from 'node:assert/strict';

/**
 * deepStrictEqual against a database row.
 *
 * node:sqlite returns each row as an object with a null prototype, and deepStrictEqual compares
 * prototypes. Rather than loosen the comparison, state the expectation in the same form as the
 * data: the expected properties are assigned onto a null-prototype object, and the two are then
 * compared strictly.
 */
export function dbStrictEqual(actual: unknown, expected: Record<string, unknown>): void {
    assert.deepStrictEqual(actual, Object.assign(Object.create(null), expected));
}
