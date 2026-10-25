// The viewer page for one streamer.

import { useEffect, useRef, useState } from 'preact/hooks';

import type { StreamerPageData } from '../../server/page-data.ts';
import type { Snapshot } from '../../server/schema.ts';
import { dataset } from './data.ts';
import { useLatestSnapshot } from './feed.ts';
import { ItemSlotView } from './Item.tsx';
import { Pillars } from './Pillars.tsx';
import { PlayerPanel } from './Player.tsx';
import { ProgressTables } from './Progress.tsx';
import { SpellSlotView } from './Spell.tsx';
import { Toggle } from './Toggle.tsx';
import { WandView } from './Wand.tsx';
import { WorldPanel } from './World.tsx';

// The game has 16 spell slots and 4 item slots. A snapshot says how many there actually are;
// these are the fewest to draw when it lists fewer.
const MIN_SPELL_SLOTS = 16;
const MIN_ITEM_SLOTS = 4;

const usesApotheosis = (snapshot: Snapshot): boolean =>
    snapshot.run?.mods.some((mod) => /apotheosis/i.test(mod)) ?? false;

/** A box of text in place of the page, for when there is nothing to show. */
function Notice({ lines }: { lines: string[] }) {
    return (
        <div class="content">
            <div class="outdated">
                {lines.map((line) => (
                    <p>{line}</p>
                ))}
            </div>
        </div>
    );
}

const AFTER_INSTALL_NOTE =
    'Note: If you just installed the mod try refreshing the page after you load into Noita with the mod enabled';

export function App({ page }: { page: StreamerPageData }) {
    const latest = useLatestSnapshot(page.snapshot, page.feed_url);

    const displayName = page.streamer.display_name;
    useEffect(() => {
        document.title = `${displayName} wands`;
    }, [displayName]);

    // Set while "Auto Refresh Data" is off: the snapshot that stays on screen meanwhile.
    const [frozen, setFrozen] = useState<Snapshot | null>(null);
    const snapshot = frozen ?? latest;

    const [showProgress, setShowProgress] = useState(false);
    const [showPillars, setShowPillars] = useState(false);
    const [invert, setInvert] = useState(false);

    // Which data set to show. The switch is the viewer's, like every other one. Its starting
    // position is decided once, from the first snapshot the page sees: on if that run has the
    // Apotheosis mod loaded. Later snapshots never move it.
    const [apothChoice, setApothChoice] = useState<boolean | null>(null);
    const firstSeen = useRef<boolean | null>(null);
    if (firstSeen.current === null && latest) firstSeen.current = usesApotheosis(latest);
    const apothContent = apothChoice ?? firstSeen.current ?? false;

    // The progress tables take a moment to draw. Switching them on shows a spinner first and
    // the tables on the next tick.
    const [progressShown, setProgressShown] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setProgressShown(showProgress), 0);
        return () => clearTimeout(timer);
    }, [showProgress]);

    if (!snapshot) {
        return (
            <Notice
                lines={[`Nothing has been received from ${displayName} yet.`, AFTER_INSTALL_NOTE]}
            />
        );
    }

    const data = dataset(apothContent);

    return (
        <div class="content">
            <div class="top-wrapper">
                {snapshot.mod.version !== page.current_mod_version && (
                    <div class="outdated">
                        <p>
                            Streamer is running outdated version:{' '}
                            {snapshot.mod.version ?? 'no version found'}
                        </p>
                        <p>
                            Modules will probably break, please update to version:{' '}
                            {page.current_mod_version}{' '}
                        </p>
                        <p>{AFTER_INSTALL_NOTE}</p>
                    </div>
                )}
                <div class="inventory-wrapper">
                    <div class="inventory">
                        {Array.from(
                            { length: Math.max(MIN_ITEM_SLOTS, snapshot.items.length) },
                            (_, i) => (
                                <ItemSlotView
                                    slot={snapshot.items[i]}
                                    apothContent={apothContent}
                                />
                            ),
                        )}
                        {Array.from(
                            { length: Math.max(MIN_SPELL_SLOTS, snapshot.inventory.length) },
                            (_, i) => (
                                <SpellSlotView slot={snapshot.inventory[i]} data={data} />
                            ),
                        )}
                    </div>
                </div>
                {snapshot.player && <PlayerPanel player={snapshot.player} data={data} />}
            </div>
            <div class="wands-wrapper">
                {snapshot.wands.map((wand) => (
                    <WandView wand={wand} data={data} />
                ))}
            </div>
            <div class="disclaimer">
                <WorldPanel snapshot={snapshot} apothContent={apothContent} />
            </div>
            <div class="switches">
                {showProgress !== progressShown && <div class="loader"></div>}
                <Toggle
                    checked={showProgress}
                    onChange={setShowProgress}
                    title="Show Progress Table"
                    class="progress-table"
                />
                <Toggle
                    checked={showPillars}
                    onChange={setShowPillars}
                    title="Show Pillars"
                    class="pillars-label"
                />
                <Toggle
                    checked={!frozen}
                    onChange={(on) => setFrozen(on ? null : snapshot)}
                    title="Auto Refresh Data"
                    class="pause-updates"
                />
                <Toggle
                    checked={invert}
                    onChange={setInvert}
                    title="Invert Highlighted"
                    class="flip-hidden"
                />
                <Toggle
                    checked={apothContent}
                    onChange={setApothChoice}
                    title="Show Apotheosis Content"
                    class="apoth-content"
                />
            </div>
            {showPillars && (
                <div>
                    <Pillars
                        unlocked={snapshot.progress.pillars}
                        apothContent={apothContent}
                        invert={invert}
                    />
                </div>
            )}
            {progressShown && (
                <ProgressTables progress={snapshot.progress} data={data} invert={invert} />
            )}
        </div>
    );
}
