// The world panel: fungal and creature shifts, the mod list, which optional features the
// streamer has enabled, and the map. Each part is hidden until its switch is turned on.

import { useState } from 'preact/hooks';

import type { Features, Snapshot } from '../../server/schema.ts';
import { MapPreview } from './Map.tsx';
import { ShiftsPanel } from './Shifts.tsx';
import { Toggle } from './Toggle.tsx';

/** The mod's optional features, as the viewer sees them named, in display order. */
const FEATURE_LABELS: Record<keyof Features, string> = {
    seed: 'Seed',
    pos: 'Position',
    ngp: 'New Game Plus',
    shifts: 'Fungal Shifts',
    timer: 'Fungal Timer',
    apothCreatureShifts: 'Creature Shifts',
    apothCreatureTimer: 'Creature Timer',
};

/** Mod ids are cut to this many characters so the list stays narrow. */
const MOD_NAME_LENGTH = 20;

export function WorldPanel({
    snapshot,
    apothContent,
}: {
    snapshot: Snapshot;
    apothContent: boolean;
}) {
    const [showShifts, setShowShifts] = useState(false);
    const [showCreatureShifts, setShowCreatureShifts] = useState(false);
    const [showMods, setShowMods] = useState(false);
    const [showFeatures, setShowFeatures] = useState(false);
    const [showMap, setShowMap] = useState(false);

    const { run, player } = snapshot;
    const features = snapshot.mod.features;
    const fungal = player?.fungal_shifts ?? null;
    const creature = snapshot.apotheosis?.creature_shifts ?? null;
    const mods = run?.mods ?? [];

    return (
        <div class="world-info">
            <div class="world-header">
                <Toggle
                    checked={showShifts}
                    onChange={setShowShifts}
                    title={`Show ${apothContent ? 'Fungal ' : ''}Shifts [${fungal?.iteration ?? 0}]`}
                />
                {apothContent && (
                    <Toggle
                        checked={showCreatureShifts}
                        onChange={setShowCreatureShifts}
                        title={`Show Creature Shifts [${creature?.iteration ?? 0}]`}
                    />
                )}
                <Toggle
                    checked={showMods}
                    onChange={setShowMods}
                    title={`Show Mods [${mods.length}]`}
                />
                <Toggle
                    checked={showFeatures}
                    onChange={setShowFeatures}
                    title="Show Feature Status"
                />
                <Toggle
                    checked={showMap}
                    onChange={setShowMap}
                    title="Show Map and Game info (spoilers!!!)"
                />
            </div>
            <div class="world-body">
                {showShifts && (
                    <ShiftsPanel
                        state={fungal}
                        kind="fungal"
                        listEnabled={features.shifts}
                        timerEnabled={features.timer}
                    />
                )}
                {showCreatureShifts && apothContent && (
                    <ShiftsPanel
                        state={creature}
                        kind="creature"
                        listEnabled={features.apothCreatureShifts}
                        timerEnabled={features.apothCreatureTimer}
                    />
                )}
                {showMods && (
                    <div class="mods">
                        <p>
                            <u>Mods:</u>
                        </p>
                        {mods.map((mod) => (
                            <p key={mod}>{mod.slice(0, MOD_NAME_LENGTH)}</p>
                        ))}
                    </div>
                )}
                {showFeatures && (
                    <div class="features">
                        <div class="features-table">
                            <div class="features-row header">
                                <div>
                                    <b>Feature: </b>
                                </div>
                                <div>
                                    <b>Status</b>
                                </div>
                            </div>
                            {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
                                <div class="features-row">
                                    <div>{label}</div>
                                    <div>
                                        {features[feature as keyof Features]
                                            ? 'Enabled'
                                            : 'Disabled'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {showMap && run && player && (
                    <MapPreview
                        run={run}
                        player={player}
                        features={features}
                        apothContent={apothContent}
                        receivedAt={snapshot.received_at}
                    />
                )}
            </div>
        </div>
    );
}
