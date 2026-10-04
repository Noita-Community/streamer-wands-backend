// The map preview: where the player is, on a tile from noitamap.com, with the run's details.

import { useEffect, useState } from 'preact/hooks';

import type { Features, Player, Run } from '../../server/schema.ts';
import { ExternalLink } from './Icon.tsx';
import { tip } from './tooltip.ts';

/** noitamap.com's index of map tile sources, by map name. */
export type TileSources = Record<string, { url: string; dziContent: string }[]>;

let tileSources: Promise<TileSources> | null = null;
const loadTileSources = (): Promise<TileSources> =>
    (tileSources ??= fetch('https://noitamap.com/js/tilesources.json').then((res) =>
        res.ok
            ? (res.json() as Promise<TileSources>)
            : Promise.reject(new Error(`HTTP ${res.status}`)),
    ));

const MAP_LABELS: Record<string, string> = {
    'regular-main-branch': 'Regular',
    'new-game-plus-main-branch': 'NG+',
    'nightmare-main-branch': 'Nightmare',
    'regular-beta': 'Regular',
    purgatory: 'Purgatory',
    apotheosis: 'Apotheosis',
    'apotheosis-beta-branch': 'Apotheosis',
    'apotheosis-new-game-plus': 'Apotheosis NG+',
    'apotheosis-tuonela': 'Apotheosis Tuonela',
    noitavania: 'Noitavania',
    'noitavania-new-game-plus': 'Noitavania NG+',
    'alternate-biomes': 'Alternate Biomes',
};

/** Perks that mean the Apotheosis run has moved to the Tuonela world. */
const TUONELA_CURSES = ['$curse_apotheosis_everything_name', '$curse_apotheosis_downunder_name'];

// The world is measured in chunks of 512 pixels.
const CHUNK = 512;
/** Chunks per map tile at the zoom level used for the preview. */
const TILE_CHUNKS = 8;
/** Vertical chunk coordinates where the hell and heaven loops begin, and their height. */
const HELL_START = 34;
const HEAVEN_START = -14;
const LOOP_HEIGHT = 48;

type Located = {
    image: string;
    name: string;
    url: string;
    x: string;
    y: string;
    /** Which parallel world, e.g. "Main", "East 2" */
    parallel: string;
    /** " Hell 1", " Heaven 2", or "" */
    vertical: string;
    /** Where on the tile image to draw the marker */
    marker: { left: string; top: string };
};

/**
 * Pick the map for this run and find the tile and marker position for the player. null when
 * the tile sources have no map for the run.
 */
export function locate(
    sources: TileSources,
    run: Pick<Run, 'ngp' | 'mods'>,
    player: Pick<Player, 'pos' | 'perks'>,
): Located | null {
    const ngp = run.ngp ?? 0;
    const x = player.pos?.x ?? 0;
    const y = player.pos?.y ?? 0;
    const mods = run.mods.map((mod) => mod.toLowerCase());

    let mapName = ngp > 0 ? 'new-game-plus-main-branch' : 'regular-main-branch';
    // How many chunks wide one parallel world is, and one map tile set.
    let worldWidth = 70;
    const tileSetWidth = 70;
    if (mods.includes('nightmare')) {
        mapName = 'nightmare-main-branch';
    } else if (mods.includes('apotheosis')) {
        mapName = ngp > 0 ? 'apotheosis-new-game-plus' : 'apotheosis';
        worldWidth = 100;
        if (player.perks.some((perk) => TUONELA_CURSES.includes(perk.id))) {
            mapName = 'apotheosis-tuonela';
        }
    } else if (mods.includes('purgatory')) {
        mapName = 'purgatory';
    } else if (mods.includes('biome-plus')) {
        mapName = 'alternate-biomes';
    } else if (mods.includes('noitavania')) {
        mapName = ngp > 0 ? 'noitavania-new-game-plus' : 'noitavania';
    }

    let tiles = sources[mapName];
    if (!tiles && mapName === 'apotheosis') {
        mapName = 'apotheosis-beta-branch';
        tiles = sources[mapName];
    }
    if (!tiles?.[0]) return null;

    const urls = tiles.map((tile) => tile.url.replace(/\.dzi/, '_files/'));
    const dzi = JSON.parse(tiles[0].dziContent) as { Image: { TopLeft: { X: number; Y: number } } };
    const originX = Math.abs(dzi.Image.TopLeft.X) / CHUNK;
    const originY = Math.abs(dzi.Image.TopLeft.Y) / CHUNK;

    // Horizontally the world repeats as parallel worlds; find which one, then the position
    // within the tile set that covers it.
    const worldIndex = (width: number) =>
        Math.sign(x) * Math.floor((Math.abs(x / CHUNK) + width / 2) / width);
    const parallelWorld = worldIndex(worldWidth);
    const tileSet = worldIndex(tileSetWidth);
    const tileX = Math.floor((x / CHUNK + originX - tileSetWidth * tileSet) / TILE_CHUNKS);
    const markerX =
        -7 + ((x + (originX - tileSetWidth * tileSet) * CHUNK - tileX * 4096) * 192) / 4096;

    let source = urls[0]!;
    let direction = 'Main';
    if (tileSet >= 1) {
        source = urls[2] ?? urls[0]!;
        direction = 'East';
    } else if (tileSet <= -1) {
        source = urls[1] ?? urls[0]!;
        direction = 'West';
    }

    // Vertically it loops into hell below and heaven above.
    let loop = 0;
    let vertical = '';
    if (y > HELL_START * CHUNK) {
        loop = Math.floor((y / CHUNK - HELL_START) / LOOP_HEIGHT);
        vertical = ` Hell ${loop + 1}`;
    } else if (y < HEAVEN_START * CHUNK) {
        loop = Math.ceil((y / CHUNK - HEAVEN_START) / LOOP_HEIGHT);
        vertical = ` Heaven ${Math.abs(loop) + 1}`;
    }
    const tileY = Math.floor((y / CHUNK + originY - loop * LOOP_HEIGHT) / TILE_CHUNKS);
    const markerY = -6 + ((y + (originY - LOOP_HEIGHT * loop) * CHUNK - tileY * 4096) * 192) / 4096;

    return {
        image: `${source}14/${tileX}_${tileY}.webp?v=1712752623`,
        name: MAP_LABELS[mapName] ?? mapName,
        url: `https://noitamap.com/?map=${mapName}&x=${x}&y=${y}&zoom=1200`,
        x: x.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        y: y.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        parallel: parallelWorld !== 0 ? `${direction} ${Math.abs(parallelWorld)}` : direction,
        vertical,
        marker: { left: `${markerX}px`, top: `${markerY}px` },
    };
}

/** "1days 2hr 5min 9sec": a duration in whole units, largest first, leaving out the zeros. */
export function duration(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    const parts: [string, number][] = [
        ['days', Math.floor(whole / 86400)],
        ['hr', Math.floor(whole / 3600) % 24],
        ['min', Math.floor(whole / 60) % 60],
        ['sec', whole % 60],
    ];
    const shown = parts.filter(([, amount]) => amount > 0);
    return shown.length > 0
        ? shown.map(([label, amount]) => `${amount}${label}`).join(' ')
        : '0sec';
}

/** A line of text with more detail in a tooltip beside it. */
function Detail({ main, detail }: { main: string; detail: string }) {
    return (
        <div class="shifts-tip" {...tip('right', [0, 5])}>
            <p class="map-tip">{main}</p>
            <div class="tooltip fit">
                <p class="map-tip">{detail}</p>
            </div>
        </div>
    );
}

/** The mod reports every this many seconds. */
const REPORT_INTERVAL_SECONDS = 3;

/**
 * Seconds of a run spent without the game clock running: time since the start, less time
 * played. `start` and `now` are unix ms, `playtime` is seconds. Rounded up to the reporting
 * interval so that it does not change with every snapshot.
 */
export function idleSeconds(start: number, playtime: number, now: number): number {
    return (
        Math.ceil(((now - start) / 1000 - playtime) / REPORT_INTERVAL_SECONDS) *
        REPORT_INTERVAL_SECONDS
    );
}

/** When the run started, with how long the streamer has spent idle in it. */
function RunStart({ start, playtime, now }: { start: number; playtime: number; now: number }) {
    const idle = idleSeconds(start, playtime, now);
    const date = new Date(start);
    return (
        <Detail
            main={`Run started on ${date.toLocaleDateString()}\nat ${date.toLocaleTimeString()}`}
            detail={`Ranted for ${duration(idle)}\n(${((idle / playtime) * 100).toFixed(2)}% of runtime)`}
        />
    );
}

type Props = {
    run: Run;
    player: Player;
    features: Features;
    apothContent: boolean;
    /** When the server received this snapshot, unix ms */
    receivedAt: number;
};

export function MapPreview({ run, player, features, apothContent, receivedAt }: Props) {
    const [sources, setSources] = useState<TileSources | null>(null);
    useEffect(() => {
        loadTileSources().then(setSources, (err) => console.log(`map data fetch failed: ${err}`));
    }, []);
    if (!sources) return null;

    const located = locate(sources, run, player);
    if (!located) return null;

    const ngp = run.ngp ?? 0;
    // noitool wants the seed the game is actually using, which NG+ increments.
    const seed = (run.seed ?? 0) + ngp;
    const seedLabel = `Map Seed: ${seed}`;

    return (
        <div class="preview">
            <div class="preview-icon-wrapper">
                <p class="preview-icon" style={located.marker}>
                    <b>&#9733;</b>
                </p>
            </div>
            <ExternalLink href={located.url}>
                <img src={located.image} />
                <p class="preview-link">Click for Fullscreen Map</p>
            </ExternalLink>
            <div class="preview-info">
                {!features.seed ? (
                    <p>
                        <i>Seed Hidden</i>
                    </p>
                ) : apothContent ? (
                    // noitool has no Apotheosis support, so there is nothing to link to.
                    <p>{seedLabel}</p>
                ) : (
                    <ExternalLink href={`https://noitool.com/info?seed=${seed}`} tabIndex={1}>
                        <Detail
                            main={seedLabel}
                            detail={`Seed was incremented by ${ngp}.\n(to display correct NG+ noitool shifts)`}
                        />
                    </ExternalLink>
                )}
                {features.pos ? (
                    <>
                        <p>x: {located.x}</p>
                        <p>y: {located.y}</p>
                    </>
                ) : (
                    <>
                        <p>
                            <i>Position Hidden</i>
                        </p>
                        <p>
                            <i>Map/PW tracker shows 0, 0</i>
                        </p>
                    </>
                )}
                {features.ngp ? (
                    <p>
                        In {located.parallel}
                        {located.vertical} NG{ngp > 0 ? `+${ngp}` : ''}
                    </p>
                ) : (
                    <p>
                        <i>NG+ Tracker Hidden</i>
                    </p>
                )}
                <p>World Type: {located.name}</p>
                <p>Playtime: {duration(run.playtime)}</p>
                {run.start_time !== null && (
                    <RunStart start={run.start_time} playtime={run.playtime} now={receivedAt} />
                )}
            </div>
        </div>
    );
}
