// Fungal shifts, and Apotheosis creature shifts, which work the same way.
//
// The table shows each shift as it was made and what it amounts to after the shifts around it.
// The calculation is in shift-rows.ts; this file is the display.

import { useState } from 'preact/hooks';

import type { Material, ShiftState } from '../../server/schema.ts';
import { computeRows, type Row, type ShiftKind, type ShiftPairs } from './shift-rows.ts';
import { Toggle } from './Toggle.tsx';
import { tip } from './tooltip.ts';

const TEXT = {
    fungal: {
        timerHidden: 'Fungal Timer Hidden',
        listHidden: 'Fungal Shift Info Hidden',
        idLabel: 'Material',
    },
    creature: {
        timerHidden: 'Creature Timer Hidden',
        listHidden: 'Creature Shift Info Hidden',
        idLabel: 'Creature',
    },
};

/** A shift can happen at most once per this many seconds. */
const COOLDOWN_SECONDS = 300;

type MaterialProps = {
    material: Material;
    kind: ShiftKind;
    /** In result cells: the earlier shifts that made this material what it is. */
    reasons?: Row[];
};

/**
 * A material's name, with a tooltip giving its id and, in result cells, the reasons for it.
 * Every one opens below the name, so that they all behave alike; a tooltip only moves when it
 * would otherwise leave the viewport.
 */
function MaterialName({ material, kind, reasons = [] }: MaterialProps) {
    const explained = reasons.length > 0;
    return (
        <div class="material tip" {...tip('bottom-start', [0, 6])}>
            <span>{material.ui_name}</span>
            <div class="tooltip fit">
                <p>{explained ? `${TEXT[kind].idLabel} ID: ${material.id}` : material.id}</p>
                {explained && <p>Reasons: </p>}
                {reasons.map((reason) => (
                    <p>
                        {reason.label}: {reason.input.id} → {reason.original.id}
                    </p>
                ))}
            </div>
        </div>
    );
}

type Props = {
    /** null when the snapshot has no shift information of this kind */
    state: ShiftState | null;
    kind: ShiftKind;
    /** The streamer has the shift list enabled in the mod's settings. */
    listEnabled: boolean;
    /** The streamer has the shift timer enabled in the mod's settings. */
    timerEnabled: boolean;
};

export function ShiftsPanel({ state, kind, listEnabled, timerEnabled }: Props) {
    const [showOriginal, setShowOriginal] = useState(false);
    /** Only consider the first N shifts; null means all of them. */
    const [upTo, setUpTo] = useState<number | null>(null);
    /** The result cell under the pointer, by row index. */
    const [hovered, setHovered] = useState<number | null>(null);

    const text = TEXT[kind];
    const total = state?.iteration ?? 0;
    // Shifts the mod could not read are left out, and the rest numbered as they then stand.
    const shifts = (state?.shifts ?? []).filter((shift): shift is ShiftPairs => shift !== null);
    const count = listEnabled ? Math.min(Math.max(upTo ?? shifts.length, 1), total) : 0;
    const rows = computeRows(shifts, count, kind);

    /** The rows whose shifts made row `i`'s result what it is. The first row can have none. */
    const causesOf = (i: number): number[] =>
        i === 0 ? [] : [rows[i]!.causeOfFinal, rows[i]!.causeOfNow].filter((c) => c !== null);

    // Hovering a result shows where it came from: the inputs of the shifts that caused it are
    // highlighted, and those rows and the hovered one show their raw output.
    const hoverCauses = hovered !== null ? causesOf(hovered) : [];
    const showsOriginal = (i: number): boolean =>
        showOriginal || (hoverCauses.length > 0 && (i === hovered || hoverCauses.includes(i)));
    const cellClass = (row: Row, highlighted = false): string =>
        [row.overwritten && 'strike', highlighted && 'highlight'].filter(Boolean).join(' ');

    const since = state?.seconds_since_last ?? null;

    return (
        <div class="shifts">
            <div class="shifts-header">
                {timerEnabled ? (
                    <p>
                        <b>Shift Timer:</b>{' '}
                        {since !== null && since > 0
                            ? `${Math.floor(COOLDOWN_SECONDS - since)} seconds remaining`
                            : 'Ready to Shift'}
                    </p>
                ) : (
                    <p>
                        <i>{text.timerHidden}</i>
                    </p>
                )}
                {listEnabled ? (
                    <>
                        <Toggle
                            checked={showOriginal}
                            onChange={setShowOriginal}
                            title="Show Original Shift in First Column"
                        />
                        <div class="shifts-input">
                            <span>Calculate up to Shift N =</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={total}
                                placeholder={String(total)}
                                value={upTo ?? ''}
                                onInput={(event) => {
                                    const value = event.currentTarget.valueAsNumber;
                                    setUpTo(Number.isFinite(value) ? value : null);
                                }}
                            />
                            <span>/ {total} Total</span>
                        </div>
                    </>
                ) : (
                    <p>
                        <i>{text.listHidden}</i>
                    </p>
                )}
            </div>
            <div class="shifts-table">
                <div class="shifts-column">
                    <div class="shifts-header-cell">
                        <b>N</b>
                    </div>
                    {rows.map((row) => (
                        <div>{row.label}</div>
                    ))}
                </div>
                <div class="shifts-column">
                    <div class="shifts-header-cell">
                        <b>Input{showOriginal ? ' → Raw Output' : ''}</b>
                    </div>
                    {rows.map((row, i) => (
                        <div class={cellClass(row, hoverCauses.includes(i))}>
                            <MaterialName material={row.input} kind={kind} />
                            {showsOriginal(i) && (
                                <>
                                    {' → '}
                                    <MaterialName material={row.original} kind={kind} />
                                </>
                            )}
                        </div>
                    ))}
                </div>
                <div class="shifts-column">
                    {kind === 'fungal' ? (
                        <div class="shifts-tip shifts-header-cell" {...tip('top', [0, 5])}>
                            <b>Final Result</b>
                            <div class="tooltip fit">
                                <p>When Final Result lists two materials:</p>
                                <ul>
                                    <li>Material 1 determines the visuals and material damage</li>
                                    <li>Material 2 determines the stain and ingestion effects</li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div class="shifts-header-cell">
                            <b>Final Result</b>
                        </div>
                    )}
                    {rows.map((row, i) => {
                        const reasons = causesOf(i).map((cause) => rows[cause]!);
                        return (
                            <div
                                class={cellClass(row)}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <MaterialName material={row.final} kind={kind} reasons={reasons} />
                                {row.now && (
                                    <>
                                        {' + '}
                                        <MaterialName
                                            material={row.now}
                                            kind={kind}
                                            reasons={reasons}
                                        />
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
