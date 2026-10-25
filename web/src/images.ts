// Images the page composes itself, on a canvas: material containers tinted and filled to their
// contents, and perk icons for Apotheosis creature shifts.
//
// Composing is asynchronous, since an image has to load first. Each result is cached by what
// it was made from. A component asks for one with a hook, gets null until it is ready, and is
// rendered again when it is.

import { useEffect, useState } from 'preact/hooks';

import type { Container } from './data.ts';
import { png } from './util.ts';

const cache = new Map<string, string>();
/** A container's colour drifts as its contents mix, so the cache is emptied when it gets big. */
const MAX_CACHED = 200;

/** The image cached under `key`, composing it first if need be. null while that is happening. */
function useComposed(key: string | null, compose: () => Promise<string>): string | null {
    const [, redraw] = useState(0);
    useEffect(() => {
        if (key === null || cache.has(key)) return;
        let mounted = true;
        compose().then(
            (url) => {
                if (cache.size >= MAX_CACHED) cache.clear();
                cache.set(key, url);
                if (mounted) redraw((n) => n + 1);
            },
            () => {},
        );
        return () => {
            mounted = false;
        };
    }, [key]);
    return key === null ? null : (cache.get(key) ?? null);
}

const load = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image failed to load'));
        img.src = src;
    });

/** Offset of the pixel at (x, y) in the RGBA data of an image `width` pixels wide. */
const pixelAt = (x: number, y: number, width: number): number => (x + y * width) * 4;

// --------------------------------------------------------------------------------------------
// Material containers

/** The inventory draws containers at twice the size of their 16x16 sprites. */
const CONTAINER_SIZE = 32;
/** Contents never rise above this row of the enlarged image. */
const CONTAINER_TOP = 6;

export type Fill = {
    /** base64 PNG of the empty container */
    sprite: string;
    container: Container;
    /** The contents' colour, packed as ABGR */
    color: number;
    /** 0 to 100 */
    fullness: number;
};

/**
 * A container tinted with its contents' colour up to its fill level, the way the game draws it
 * in the inventory. Pass null for an item with nothing in it.
 */
export function useContainerImage(fill: Fill | null): string | null {
    let key: string | null = null;
    let fillFrom = 0;
    if (fill) {
        // The row the contents start at is all the image depends on, not the exact fullness.
        const rows = fill.container.fillRows;
        if (rows !== null) {
            fillFrom = Math.max(
                CONTAINER_TOP,
                Math.floor(rows * (1 - fill.fullness / 100) + CONTAINER_TOP),
            );
        }
        key = `container|${fill.sprite.length}|${fill.container.brightness}|${fill.color & 0xffffff}|${fillFrom}`;
    }

    return useComposed(key, async () => {
        const { sprite, container, color } = fill!;
        const red = color & 0xff;
        const green = (color >> 8) & 0xff;
        const blue = (color >> 16) & 0xff;

        const img = await load(png(sprite));
        const canvas = document.createElement('canvas');
        canvas.width = CONTAINER_SIZE;
        canvas.height = CONTAINER_SIZE;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.filter = `brightness(${container.brightness}%)`;
        ctx.drawImage(img, 0, 0, CONTAINER_SIZE, CONTAINER_SIZE);

        const imageData = ctx.getImageData(0, 0, CONTAINER_SIZE, CONTAINER_SIZE);
        const data = imageData.data;
        // Multiply each pixel from the fill line down by the contents' colour.
        for (let i = pixelAt(0, fillFrom, CONTAINER_SIZE); i < data.length; i += 4) {
            data[i] = (red * data[i]!) >> 8;
            data[i + 1] = (green * data[i + 1]!) >> 8;
            data[i + 2] = (blue * data[i + 2]!) >> 8;
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    });
}

// --------------------------------------------------------------------------------------------
// Creature shift perk icons

const ICON_SIZE = 16;

function pixelsOf(img: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx, imageData: ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE) };
}

export type CreatureShift = {
    creatureId: string;
    /** base64 PNG of the creature */
    creature: string;
    /** base64 PNG of the empty creature-shift perk frame */
    frame: string;
};

/**
 * The icon for an Apotheosis creature-shift perk: the creature's sprite drawn inside the empty
 * creature-shift frame. Pass null for any other perk.
 */
export function useCreatureShiftImage(shift: CreatureShift | null): string | null {
    const key = shift ? `creature|${shift.creatureId}|${shift.creature.length}` : null;

    return useComposed(key, async () => {
        const { creatureId, creature, frame } = shift!;
        const [creatureImg, frameImg] = await Promise.all([load(png(creature)), load(png(frame))]);
        const icon = pixelsOf(creatureImg).imageData.data;
        const out = pixelsOf(frameImg);
        const data = out.imageData.data;

        const at = (x: number, y: number) => pixelAt(x, y, ICON_SIZE);
        const frameBackground = data.slice(at(5, 4), at(5, 4) + 3);
        const frameCorner = data.slice(at(5, 2), at(5, 2) + 4);
        // Apotheosis's miniblob sprite sits four rows too low in its image.
        const nudge = creatureId === 'miniblob' ? at(0, -4) : 0;

        // The frame's window is 9x9, from (4, 3) to (12, 11).
        for (let y = 3; y < 12; y++) {
            for (let x = 4; x < 13; x++) {
                const i = at(x, y);
                const pixel = icon.slice(i, i + 4);
                const alpha = pixel[3]! / 255;
                if (alpha > 0 && alpha < 1) {
                    // Blend a translucent pixel over the frame's background.
                    for (let ch = 0; ch < 3; ch++) {
                        data[i + ch + nudge] = Math.ceil(
                            frameBackground[ch]! * (1 - alpha) + pixel[ch]! * alpha,
                        );
                    }
                    data[i + 3 + nudge] = 0xff;
                } else if (pixel.every((channel) => channel !== 0)) {
                    data.set(pixel, i + nudge);
                }
            }
        }
        // The window's corners are rounded: put the frame's own colour back on them.
        for (const [x, y] of [
            [4, 3],
            [12, 3],
            [4, 11],
            [12, 11],
        ] as const) {
            data.set(frameCorner, at(x, y));
        }
        out.ctx.putImageData(out.imageData, 0, 0);
        return out.canvas.toDataURL();
    });
}
