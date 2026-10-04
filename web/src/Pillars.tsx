// The achievement pillars: the game's own progress display, one column per pillar, each cell
// lit once its achievement flag is set.

import { useState } from 'preact/hooks';

import { pillars, pillarsApoth, type PillarCell } from './data.ts';
import { Toggle } from './Toggle.tsx';
import { tip } from './tooltip.ts';
import { png } from './util.ts';

type CellProps = {
    cell: PillarCell;
    /** The pillar's name, for achievement cells; absent for the heading cell itself. */
    pillarName?: string;
    lit: boolean;
};

function Cell({ cell, pillarName, lit }: CellProps) {
    return (
        <div
            class={pillarName ? 'pillar-cell pillar-zoom' : 'pillar-cell'}
            {...tip('right', [10, 50])}
        >
            <img data-tip-ref src={png(cell.icon)} class={lit ? undefined : 'pillar-dark'} />
            {pillarName && (
                <div class="tooltip">
                    <p>{pillarName}:</p>
                    <p>{cell.name}</p>
                    {cell.desc && <p>{cell.desc}</p>}
                </div>
            )}
        </div>
    );
}

type Props = {
    /** Achievement flags the streamer has, from the snapshot's progress */
    unlocked: string[];
    apothContent: boolean;
    /** Light what is locked instead of what is unlocked. */
    invert: boolean;
};

export function Pillars({ unlocked, apothContent, invert }: Props) {
    const [showApotheosis, setShowApotheosis] = useState(false);
    const set = showApotheosis ? pillarsApoth : pillars;
    const have = new Set(unlocked);

    // The first cell of each pillar is its heading and is not an achievement.
    const summaries = set.map((pillar) => {
        const done = pillar.map((cell) => cell.key !== undefined && have.has(cell.key));
        return { done, count: done.filter(Boolean).length, total: pillar.length - 1 };
    });
    const tallest = Math.max(...summaries.map((s) => s.total));
    const count = summaries.reduce((sum, s) => sum + s.count, 0);
    const total = summaries.reduce((sum, s) => sum + s.total, 0);

    return (
        <div class="pillars-wrapper">
            <div class="pillars-header">
                <div class="top-border"></div>
                <div class="pillars-header-text">
                    {apothContent && (
                        <Toggle
                            checked={showApotheosis}
                            onChange={setShowApotheosis}
                            title="Show Apotheosis Pillars"
                        />
                    )}
                    <p>
                        Total: {count} / {total}
                    </p>
                </div>
            </div>
            <div class="pillars">
                {set.map((pillar, i) => {
                    const summary = summaries[i]!;
                    const complete = summary.count === summary.total;
                    return (
                        <div class="pillar">
                            <p class="pillars-header">
                                {summary.count} / {summary.total}
                            </p>
                            {/* Shorter pillars are padded so they all stand on the same line. */}
                            {Array.from({ length: tallest - summary.total }, () => (
                                <div class="spacer"></div>
                            ))}
                            {pillar.map((cell, k) => (
                                <Cell
                                    cell={cell}
                                    pillarName={k > 0 ? pillar[0]!.name : undefined}
                                    lit={(summary.done[k]! || complete) !== invert}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
