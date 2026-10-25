// The game's reference data: spells, icons, items, pillars and wand sprites. These are constants
// scraped from the game files, imported as JSON and built into the bundle.
//
// There are two complete sets of spells and icons, one for the base game and one for the
// Apotheosis mod. The page shows one or the other.

import apothIconsJson from '../data/apothIcons.json';
import iconsJson from '../data/icons.json';
import itemDataJson from '../data/itemData.json';
import mainSpellIdsJson from '../data/mainSpellIds.json';
import pillarsApothJson from '../data/pillarsApoth.json';
import pillarsJson from '../data/pillars.json';
import spellDataApothJson from '../data/spellDataApoth.json';
import spellDataJson from '../data/spellData.json';
import wandSpritesJson from '../data/wandSprites.json';

export type SpellInfo = {
    name: string;
    description: string;
    /** Engine field names to values, e.g. action_type, fire_rate_wait, action_mana_drain */
    meta?: Record<string, number>;
    /** base64 PNG */
    sprite: string;
};

export type Icon = {
    id: string;
    /** base64 PNG */
    image: string;
    name: string;
    description?: string | null;
    /** base64 PNG drawn behind the icon; spells use it for their type's frame */
    bgImage?: string | null;
    wiki_url?: string | null;
    /** Perks only: the translation key the game reports for this perk, e.g. $perk_extra_hp */
    ui_name?: string;
    /** Perks only: base64 PNG of the in-game UI icon, preferred over `image` when present */
    ui_img?: string;
};

type IconSet = {
    enemies: Icon[];
    perks: Icon[];
    spells: Icon[];
    /** Icons that are not real perks or spells: essences, placeholders for missing entries */
    pseuds: Icon[];
};

type ItemInfo = {
    name: string;
    /** description translation key (without $) to text */
    description: Record<string, string>;
    /** sprite path to base64 PNG */
    sprite: Record<string, string>;
};

/** The first cell of a pillar is its heading (no key); the rest are achievements. */
export type PillarCell = { icon: string; name: string; key?: string; desc?: string };

export const itemData = itemDataJson as Record<string, ItemInfo>;
export const pillars = pillarsJson as PillarCell[][];
export const pillarsApoth = pillarsApothJson as PillarCell[][];

/** Spells in the released base game. The wand simulator sites accept nothing else. */
export const mainSpellIds = new Set(mainSpellIdsJson as string[]);

// --------------------------------------------------------------------------------------------
// Wand sprites

const wandSprites = wandSpritesJson as Record<string, string>;

/**
 * The sprite for a wand, from the sprite file the game reports for it. Sprites are keyed by
 * file name without directory or extension. An unknown wand looks like the starter bomb wand.
 */
export function wandSprite(spriteFile: string): { image: string; animated: boolean } {
    const key = /([^/]+)\./.exec(spriteFile)?.[1] ?? spriteFile;
    return {
        image: wandSprites[key] ?? wandSprites['bomb_wand']!,
        // The chainsaw's sprite is a sheet of animation frames.
        animated: key === 'chainsaw',
    };
}

// --------------------------------------------------------------------------------------------
// Material containers

export type Container = {
    /** Units of material that fill one percent of the container */
    unitsPerPercent: number;
    /**
     * How many rows of the 32-row inventory image the contents can occupy, measured down from
     * row 6. null for containers drawn in a single colour with no fill line.
     */
    fillRows: number | null;
    /**
     * Brightness applied to the sprite, in percent. The sprites in the game's data are darker
     * than they look in game; these values are matched by eye.
     */
    brightness: number;
};

const DEFAULT_CONTAINER: Container = { unitsPerPercent: 10, fillRows: null, brightness: 116 };

const CONTAINERS: Record<string, Container> = {
    'data/ui_gfx/items/potion.png': { unitsPerPercent: 10, fillRows: 24, brightness: 116 },
    'data/ui_gfx/items/potion_alchemist.png': { unitsPerPercent: 5, fillRows: 22, brightness: 116 },
    'data/ui_gfx/items/potion_reinforced.png': {
        unitsPerPercent: 20,
        fillRows: 22,
        brightness: 116,
    },
    'data/ui_gfx/items/material_pouch.png': { unitsPerPercent: 15, fillRows: 22, brightness: 135 },
};

/** What is known about the container drawn with the sprite at `path`. */
export const container = (path: string): Container =>
    Object.hasOwn(CONTAINERS, path) ? CONTAINERS[path]! : DEFAULT_CONTAINER;

// --------------------------------------------------------------------------------------------
// Data sets

const byKey = <T>(items: T[], key: (item: T) => string | undefined): Map<string, T> => {
    const map = new Map<string, T>();
    for (const item of items) {
        const k = key(item);
        if (k !== undefined) map.set(k, item);
    }
    return map;
};

/** Everything the page needs from one of the two data sets, with lookups built once. */
export type Dataset = {
    spells: Record<string, SpellInfo>;
    /** In display order, for the progress tables */
    perks: Icon[];
    spellIcons: Icon[];
    /** Excludes the right-facing turret, which is the same enemy as the left-facing one. */
    enemies: Icon[];
    spellIcon: Map<string, Icon>;
    /** keyed by the translation key the game reports, e.g. $perk_extra_hp */
    perkByUiName: Map<string, Icon>;
    pseud: Map<string, Icon>;
    /** keyed by id; includes every enemy */
    enemy: Map<string, Icon>;
    /** Shown in place of a spell or perk the data set does not know. */
    missingSpell: Icon;
    missingPerk: Icon;
};

function makeDataset(spells: Record<string, SpellInfo>, set: IconSet): Dataset {
    const pseud = byKey(set.pseuds, (i) => i.id);
    return {
        spells,
        perks: set.perks,
        spellIcons: set.spells,
        enemies: set.enemies.filter((icon) => icon.id !== 'turret_right'),
        spellIcon: byKey(set.spells, (i) => i.id),
        perkByUiName: byKey(set.perks, (i) => i.ui_name),
        pseud,
        enemy: byKey(set.enemies, (i) => i.id),
        missingSpell: pseud.get('missingSpell')!,
        missingPerk: pseud.get('missingPerk')!,
    };
}

const base = makeDataset(spellDataJson as Record<string, SpellInfo>, iconsJson as IconSet);
const apotheosis = makeDataset(
    spellDataApothJson as Record<string, SpellInfo>,
    apothIconsJson as IconSet,
);

export const dataset = (apoth: boolean): Dataset => (apoth ? apotheosis : base);
