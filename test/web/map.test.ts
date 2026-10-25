// Where the map preview puts the player: which map, which parallel world, how far into heaven
// or hell, and which tile to show. Also the run's durations.

import { describe, expect, it } from 'vitest';

import { duration, idleSeconds, locate, type TileSources } from '../../web/src/Map.tsx';

const CHUNK = 512;

/** A map whose top-left corner is 35 chunks left of and 14 chunks above the world's origin. */
const tiles = (name: string) => [
    {
        url: `https://maps.example/${name}.dzi`,
        dziContent: JSON.stringify({ Image: { TopLeft: { X: -35 * CHUNK, Y: -14 * CHUNK } } }),
    },
    { url: `https://maps.example/${name}-west.dzi`, dziContent: '{}' },
    { url: `https://maps.example/${name}-east.dzi`, dziContent: '{}' },
];

const sources: TileSources = Object.fromEntries(
    [
        'regular-main-branch',
        'new-game-plus-main-branch',
        'nightmare-main-branch',
        'apotheosis',
        'apotheosis-tuonela',
    ].map((name) => [name, tiles(name)]),
);

const run = { ngp: 0, mods: ['streamer_wands'] };
const at = (x: number, y: number) => ({ pos: { x, y }, perks: [] });

describe('locate', () => {
    it('places a player at the origin on the regular map’s main world', () => {
        const where = locate(sources, run, at(0, 0))!;
        expect(where.name).toBe('Regular');
        expect(where.parallel).toBe('Main');
        expect(where.vertical).toBe('');
        // 35 chunks from the left and 14 from the top, at 8 chunks per tile.
        expect(where.image).toBe(
            'https://maps.example/regular-main-branch_files/14/4_1.webp?v=1712752623',
        );
        expect(where.url).toBe('https://noitamap.com/?map=regular-main-branch&x=0&y=0&zoom=1200');
    });

    it('treats a hidden position as the origin', () => {
        expect(locate(sources, run, { pos: null, perks: [] })!.image).toBe(
            locate(sources, run, at(0, 0))!.image,
        );
    });

    it('counts parallel worlds east and west, 70 chunks apart', () => {
        expect(locate(sources, run, at(34 * CHUNK, 0))!.parallel).toBe('Main');
        expect(locate(sources, run, at(36 * CHUNK, 0))!.parallel).toBe('East 1');
        expect(locate(sources, run, at(-36 * CHUNK, 0))!.parallel).toBe('West 1');
        expect(locate(sources, run, at(3 * 70 * CHUNK, 0))!.parallel).toBe('East 3');
    });

    it('uses the east and west tile sets for the parallel worlds', () => {
        expect(locate(sources, run, at(70 * CHUNK, 0))!.image).toContain('-east_files/');
        expect(locate(sources, run, at(-70 * CHUNK, 0))!.image).toContain('-west_files/');
    });

    it('counts loops into hell below and heaven above', () => {
        expect(locate(sources, run, at(0, 33 * CHUNK))!.vertical).toBe('');
        expect(locate(sources, run, at(0, 35 * CHUNK))!.vertical).toBe(' Hell 1');
        expect(locate(sources, run, at(0, (34 + 48 + 1) * CHUNK))!.vertical).toBe(' Hell 2');
        expect(locate(sources, run, at(0, -15 * CHUNK))!.vertical).toBe(' Heaven 1');
        expect(locate(sources, run, at(0, (-14 - 48 - 1) * CHUNK))!.vertical).toBe(' Heaven 2');
    });

    it('shows the same tile for the same place in each loop', () => {
        const here = locate(sources, run, at(0, 40 * CHUNK))!;
        const oneLoopDown = locate(sources, run, at(0, (40 + 48) * CHUNK))!;
        expect(oneLoopDown.image).toBe(here.image);
        expect(oneLoopDown.marker).toEqual(here.marker);
    });

    it('picks the map from New Game Plus and the run’s mods', () => {
        const name = (ngp: number, mods: string[], perks: { id: string; count: number }[] = []) =>
            locate(sources, { ngp, mods }, { pos: null, perks })?.name;

        expect(name(1, [])).toBe('NG+');
        expect(name(0, ['Nightmare'])).toBe('Nightmare');
        expect(name(0, ['Apotheosis'])).toBe('Apotheosis');
        expect(
            name(0, ['apotheosis'], [{ id: '$curse_apotheosis_downunder_name', count: 1 }]),
        ).toBe('Apotheosis Tuonela');
    });

    it('measures parallel worlds on the Apotheosis map at 100 chunks', () => {
        const apotheosis = { ngp: 0, mods: ['apotheosis'] };
        expect(locate(sources, apotheosis, at(30 * CHUNK, 0))!.parallel).toBe('Main');
        expect(locate(sources, apotheosis, at(51 * CHUNK, 0))!.parallel).toBe('East 1');
        // On the regular map the same place is already in the next world.
        expect(locate(sources, run, at(51 * CHUNK, 0))!.parallel).toBe('East 1');
        expect(locate(sources, apotheosis, at(149 * CHUNK, 0))!.parallel).toBe('East 1');
        expect(locate(sources, run, at(149 * CHUNK, 0))!.parallel).toBe('East 2');
    });

    it('falls back to the Apotheosis beta map when there is no release one', () => {
        const onlyBeta: TileSources = { 'apotheosis-beta-branch': tiles('apotheosis-beta-branch') };
        const where = locate(onlyBeta, { ngp: 0, mods: ['apotheosis'] }, at(0, 0))!;
        expect(where.name).toBe('Apotheosis');
        expect(where.url).toContain('map=apotheosis-beta-branch');
    });

    it('gives up when there are no tiles for the run’s map', () => {
        expect(locate(sources, { ngp: 0, mods: ['purgatory'] }, at(0, 0))).toBeNull();
        expect(locate({}, run, at(0, 0))).toBeNull();
    });
});

describe('duration', () => {
    it('lists whole units, largest first', () => {
        expect(duration(3725)).toBe('1hr 2min 5sec');
        expect(duration(59)).toBe('59sec');
        expect(duration(125.9)).toBe('2min 5sec');
    });

    it('leaves out units that are zero', () => {
        expect(duration(3600)).toBe('1hr');
        expect(duration(3605)).toBe('1hr 5sec');
        expect(duration(60)).toBe('1min');
    });

    it('rolls hours over into days', () => {
        expect(duration(90061)).toBe('1days 1hr 1min 1sec');
        expect(duration(23 * 3600)).toBe('23hr');
        expect(duration(30 * 86400)).toBe('30days');
    });

    it('says something for no time at all', () => {
        expect(duration(0)).toBe('0sec');
        expect(duration(0.4)).toBe('0sec');
        expect(duration(-5)).toBe('0sec');
    });
});

describe('idleSeconds', () => {
    it('is the time since the run started, less time played', () => {
        expect(idleSeconds(0, 40, 100_000)).toBe(60);
    });

    it('rounds up to the next three seconds', () => {
        expect(idleSeconds(0, 41.5, 100_000)).toBe(60);
        expect(idleSeconds(0, 39.5, 100_000)).toBe(63);
    });
});
