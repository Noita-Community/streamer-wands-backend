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

type Side = 'top' | 'right' | 'bottom' | 'left';

type MaterialProps = {
    material: Material;
    side: Side;
    kind: ShiftKind;
    /** In result cells: the earlier shifts that made this material what it is. */
    reasons?: Row[];
};

/** A material's name, with a tooltip giving its id and, in result cells, the reasons for it. */
function MaterialName({ material, side, kind, reasons = [] }: MaterialProps) {
    const explained = reasons.length > 0;
    return (
        <div class="material tip" {...tip(side, [explained ? 27 : 0, side === 'left' ? 44.5 : 10])}>
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

    // Hovering a result shows where it came from: the rows that caused it are highlighted, and
    // those rows and the hovered one show their raw output.
    const hover = hovered !== null ? rows[hovered] : undefined;
    const hoverCauses = hover
        ? [hover.causeOfFinal, hover.causeOfNow].filter((c) => c !== null)
        : [];
    const showsOriginal = (i: number): boolean =>
        showOriginal || (hoverCauses.length > 0 && (i === hovered || hoverCauses.includes(i)));
    const cellClass = (row: Row, highlighted: boolean): string =>
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
                            <MaterialName material={row.input} side="left" kind={kind} />
                            {showsOriginal(i) && (
                                <>
                                    {' → '}
                                    <MaterialName
                                        material={row.original}
                                        side={row.original.id !== row.final.id ? 'top' : 'right'}
                                        kind={kind}
                                    />
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
                        // With two materials, the first one's tooltip opens above or below so
                        // that it does not cover the second.
                        const side = !row.now ? 'right' : row.causeOfFinal ? 'bottom' : 'top';
                        return (
                            <div
                                class={cellClass(row, i === hover?.causeOfFinal)}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <MaterialName
                                    material={row.final}
                                    side={side}
                                    kind={kind}
                                    reasons={reasons}
                                />
                                {row.now && (
                                    <>
                                        {' + '}
                                        <MaterialName
                                            material={row.now}
                                            side="right"
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
