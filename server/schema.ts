// Canonical snapshot schema and the two conversions into it.
//
//   fromWire(payload)  mod wire shape (any known generation)  ->  canonical, current version
//   migrate(stored, v) stored canonical at row version v       ->  canonical, current version
//
// The wire shape is whatever a mod sends: positional arrays and delimited strings, differing
// between mod versions. The canonical shape is one structure defined by what the data means,
// using the game engine's own field names. It is what the database stores and what the viewer
// page receives; the page formats it for display but never restructures it.

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Canonical types

export type Features = {
    seed: boolean;
    pos: boolean;
    ngp: boolean;
    shifts: boolean;
    timer: boolean;
    apothCreatureShifts: boolean;
    apothCreatureTimer: boolean;
};

export const FEATURE_NAMES = [
    'seed',
    'pos',
    'ngp',
    'shifts',
    'timer',
    'apothCreatureShifts',
    'apothCreatureTimer',
] as const satisfies readonly (keyof Features)[];

/** `uses_remaining` is the engine's value: -1 means unlimited. null when the mod generation did not report it. */
export type Spell = { action_id: string; uses_remaining: number | null };
export type SpellSlot = Spell | null;

export type Wand = {
    sprite_file: string;
    ui_name: string;
    mana_max: number;
    mana_charge_speed: number;
    reload_time: number;
    actions_per_round: number;
    deck_capacity: number;
    shuffle_deck_when_empty: boolean;
    spread_degrees: number;
    speed_multiplier: number;
    fire_rate_wait: number;
    always_cast: Spell[];
    deck: SpellSlot[];
};

export type ItemContents = { material: string; ui_name: string; amount: number };

export type ItemSlot =
    | {
          kind: 'item';
          ui_sprite: string;
          /** Translation key including its leading $, as the game stores it */
          item_name: string;
          ui_description: string;
          /** ABGR packed colour; potions and stashes only */
          color: number | null;
          contents: ItemContents[];
      }
    /** The descriptor did not fit the format the mod writes. Kept verbatim; displays as an empty slot. */
    | { kind: 'unparsed'; raw: string }
    | null;

export type Material = { id: string; ui_name: string };
/** One shift may convert several inputs. null when the mod could not read the shift. */
export type Shift = { from: Material; to: Material }[] | null;

export type ShiftState = {
    iteration: number;
    /** null when the feature is off or the mod reported the timer expired */
    seconds_since_last: number | null;
    /** null when the feature is off */
    shifts: Shift[] | null;
};

export type Run = {
    mods: string[];
    beta: boolean;
    ngp: number | null;
    seed: number | null;
    /** unix ms; null when the mod did not record one */
    start_time: number | null;
    /** seconds */
    playtime: number;
};

export type Player = {
    /** game units as strings so "inf" and "nan" survive */
    hp: string;
    max_hp: string;
    money: number;
    orbs: number;
    pos: { x: number; y: number } | null;
    /** most recent first */
    perks: { id: string; count: number }[];
    fungal_shifts: ShiftState;
};

/**
 * The write surface of the snapshot column: what fromWire() produces and writeSnapshot() accepts.
 * Always at SCHEMA_VERSION. The version is recorded in the row's schema_version column, not here.
 */
export type InsertableSnapshot = {
    mod: {
        version: string | null;
        features: Features;
    };
    wands: Wand[];
    inventory: SpellSlot[];
    items: ItemSlot[];
    progress: {
        perks: string[];
        spells: string[];
        enemies: string[];
        pillars: string[];
    };
    /** null when the sending mod generation had no run section */
    run: Run | null;
    /** null when the sending mod generation had no player section */
    player: Player | null;
    /** null when Apotheosis is not installed */
    apotheosis: { creature_shifts: ShiftState } | null;
};

/**
 * The read surface of the snapshot column: what migrate() returns for a row's parsed JSON and
 * its schema_version. A raw query result is not one of these until it has been through migrate().
 */
export type SelectableSnapshot = InsertableSnapshot;

/**
 * What the rest of the system and the viewer page work with: the stored snapshot plus when the
 * server received it. `received_at` is the row's `updated_at`; it is never stored in the JSON.
 */
export type Snapshot = SelectableSnapshot & {
    /** unix ms */
    received_at: number;
};

/** The body of GET /api/streamer/:name: what the viewer page starts from. */
export type StreamerResponse = {
    streamer: { login: string | null; display_name: string };
    /** The mod version this server hands out; the page warns when the streamer's differs. */
    current_mod_version: string;
    /** null when the streamer has never sent anything */
    snapshot: Snapshot | null;
};

// ---------------------------------------------------------------------------
// Small guards

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

// ---------------------------------------------------------------------------
// Wire decoding of the individual encodings the mod uses

/** "ACTION_ID_#charges", a bare "ACTION_ID" from mods before charge reporting, or "0" for an empty slot. */
export function parseSpellSlot(raw: unknown): SpellSlot {
    if (!isStr(raw) || raw === '0' || raw === '') return null;
    const at = raw.lastIndexOf('_#');
    if (at < 0) return { action_id: raw, uses_remaining: null };
    const uses = Number(raw.slice(at + 2));
    return { action_id: raw.slice(0, at), uses_remaining: Number.isFinite(uses) ? uses : null };
}

/** Spells that are never empty slots (always-cast). Drops anything unparseable. */
const parseSpells = (v: unknown): Spell[] =>
    strings(v)
        .map(parseSpellSlot)
        .filter((s): s is Spell => s !== null);

// Each contents entry is written by the mod as string.format("@%s (%s)#%s", ui_name, material, amount).
const MATERIAL_ENTRY = /^([\s\S]*) \(([^()]+)\)#(-?\d+)$/;

/**
 * Item descriptor as the mod builds it: `ui_sprite .. item_name .. ui_description .. "$" .. color .. contents`.
 *
 * The mod puts no delimiter between the first three. They can be told apart only because the
 * game's item names and descriptions are normally translation keys, which start with `$`. Where
 * the game supplies literal text instead, as it does for some modded items, the three run
 * together and cannot be split. Such a descriptor is kept whole as `unparsed`, and the page
 * shows an empty slot for it.
 */
export function parseItemSlot(raw: unknown): ItemSlot {
    if (!isStr(raw) || raw === '0' || raw === '') return null;
    const parts = raw.split('$');
    if (parts.length < 4) return { kind: 'unparsed', raw };
    const ui_sprite = parts[0]!;
    const item_name = `$${parts[1]}`;
    const ui_description = `$${parts[2]}`;
    // Material ui_names in the contents can themselves be untranslated `$mat_*` keys, so rejoin the tail.
    const [colorRaw, ...entries] = parts.slice(3).join('$').split('@');
    if (!/^-?\d+$/.test(colorRaw ?? '')) return { kind: 'unparsed', raw };

    const contents: ItemContents[] = [];
    for (const entry of entries) {
        const e = MATERIAL_ENTRY.exec(entry);
        if (!e) return { kind: 'unparsed', raw };
        contents.push({ ui_name: e[1]!, material: e[2]!, amount: Number(e[3]) });
    }

    return {
        kind: 'item',
        ui_sprite,
        item_name,
        ui_description,
        color: colorRaw === '-1' ? null : Number(colorRaw),
        contents,
    };
}

const parseMaterial = (raw: string): Material => {
    const at = raw.indexOf('%@%');
    return at < 0
        ? { id: raw, ui_name: raw }
        : { id: raw.slice(0, at), ui_name: raw.slice(at + 3) };
};

/** `id%@%Name<,>id%@%Name...` alternating from, to. "empty" when the mod could not read it. */
export function parseShift(raw: unknown): Shift {
    if (!isStr(raw) || raw === 'empty' || raw === '') return null;
    const mats = raw.split('<,>').map(parseMaterial);
    const pairs: { from: Material; to: Material }[] = [];
    for (let i = 0; i + 1 < mats.length; i += 2) pairs.push({ from: mats[i]!, to: mats[i + 1]! });
    return pairs;
}

/** The mod reports -1 for "expired or unknown"; that is the mod's sentinel, not the engine's. */
const parseTimer = (v: unknown): number | null => (isNum(v) && v >= 0 ? v : null);

/** `year,month0,day,hour,minute,second` in UTC, written by the mod at run start. */
export function parseStartTime(raw: unknown): number | null {
    if (!isStr(raw) || raw === '') return null;
    const parts = raw.split(',').map(Number);
    if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return null;
    const [y, m0, d, h, mi, s] = parts as [number, number, number, number, number, number];
    const ms = Date.UTC(y, m0, d, h, mi, s);
    return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// Sections

function wandFromWire(v: unknown): Wand | null {
    // Every known generation sends [stats, always_cast, deck].
    if (!Array.isArray(v) || !isDict(v[0])) return null;
    const s = v[0];
    const num = (k: string) => (isNum(s[k]) ? (s[k] as number) : 0);
    return {
        sprite_file: isStr(s.sprite) ? s.sprite : '',
        ui_name: isStr(s.ui_name) ? s.ui_name : '',
        mana_max: num('mana_max'),
        mana_charge_speed: num('mana_charge_speed'),
        reload_time: num('reload_time'),
        actions_per_round: num('actions_per_round'),
        deck_capacity: num('deck_capacity'),
        shuffle_deck_when_empty: s.shuffle_deck_when_empty === true,
        spread_degrees: num('spread_degrees'),
        speed_multiplier: num('speed_multiplier'),
        fire_rate_wait: num('fire_rate_wait'),
        always_cast: parseSpells(v[1]),
        deck: strings(v[2]).map(parseSpellSlot),
    };
}

function featuresFromWire(v: unknown): Features {
    // Absent entirely in mods before settings existed; absent keys mean false.
    const d = isDict(v) ? v : {};
    const out = {} as Features;
    for (const name of FEATURE_NAMES) out[name] = d[name] === true;
    return out;
}

function runFromWire(v: unknown): Run | null {
    if (!isDict(v)) return null;
    return {
        mods: strings(v.mods),
        beta: v.beta === true,
        ngp: numOrNull(v.ngp),
        seed: numOrNull(v.seed),
        start_time: parseStartTime(v.start),
        playtime: isNum(v.playtime) ? v.playtime : 0,
    };
}

function shiftStateFromWire(
    d: Dict,
    keys: { iteration: string; timer: string; list: string },
): ShiftState {
    return {
        iteration: isNum(d[keys.iteration]) ? (d[keys.iteration] as number) : 0,
        seconds_since_last: parseTimer(d[keys.timer]),
        shifts: Array.isArray(d[keys.list]) ? (d[keys.list] as unknown[]).map(parseShift) : null,
    };
}

function playerFromWire(v: unknown): Player | null {
    if (!isDict(v)) return null;
    // Health arrives as strings from current mods and numbers from older ones.
    const health = Array.isArray(v.health) ? v.health : [];
    const hp = (i: number) => (isStr(health[i]) || isNum(health[i]) ? String(health[i]) : 'nan');
    const perksRaw = Array.isArray(v.perks) ? v.perks : [];
    const names = strings(perksRaw[0]);
    const counts = Array.isArray(perksRaw[1]) ? perksRaw[1] : [];
    const pos = v.pos;
    return {
        hp: hp(0),
        max_hp: hp(1),
        money: isNum(v.gold) ? v.gold : 0,
        orbs: isNum(v.orbs) ? v.orbs : 0,
        pos: Array.isArray(pos) && isNum(pos[0]) && isNum(pos[1]) ? { x: pos[0], y: pos[1] } : null,
        perks: names.map((id, i) => ({ id, count: isNum(counts[i]) ? counts[i] : 1 })),
        fungal_shifts: shiftStateFromWire(v, {
            iteration: 'shiftsTotal',
            timer: 'shiftsTimer',
            list: 'shiftsList',
        }),
    };
}

function apotheosisFromWire(v: unknown): InsertableSnapshot['apotheosis'] {
    if (!isDict(v)) return null;
    return {
        creature_shifts: shiftStateFromWire(v, {
            iteration: 'csTotal',
            timer: 'csTimer',
            list: 'csShifts',
        }),
    };
}

// ---------------------------------------------------------------------------
// Entry points

/**
 * Convert whatever a mod sent into the current canonical shape.
 * Recognises wire generations by shape, never by a version field.
 * Returns null only when the input is not recognisable as a snapshot at all.
 */
export function fromWire(payload: unknown): InsertableSnapshot | null {
    // Oldest generation: the wands array was the entire payload.
    const d: Dict | null = Array.isArray(payload)
        ? { wands: payload }
        : isDict(payload)
          ? payload
          : null;
    if (!d) return null;

    const progress = Array.isArray(d.progress) ? d.progress : [];

    return {
        mod: {
            version: isStr(d.modVersion) ? d.modVersion : null,
            features: featuresFromWire(d.modFeatures),
        },
        wands: Array.isArray(d.wands)
            ? d.wands.map(wandFromWire).filter((w): w is Wand => w !== null)
            : [],
        inventory: strings(d.inventory).map(parseSpellSlot),
        items: strings(d.items).map(parseItemSlot),
        // Generations before pillar tracking sent three tables; before progress tracking, none.
        progress: {
            perks: strings(progress[0]),
            spells: strings(progress[1]),
            enemies: strings(progress[2]),
            pillars: strings(progress[3]),
        },
        run: runFromWire(d.runInfo),
        player: playerFromWire(d.playerInfo),
        apotheosis: apotheosisFromWire(d.apothInfo),
    };
}

type Migration = (stored: Dict) => Dict;

/** Index n upgrades a snapshot at version n to version n + 1. Empty until the schema changes. */
const MIGRATIONS: Record<number, Migration> = {};

/**
 * Turn the parsed contents of a snapshot column into a current-version snapshot.
 *
 * `stored` is whatever JSON.parse gave back and `version` is the row's schema_version column,
 * which is the only record of what shape that JSON is in. Nothing may treat stored data as a
 * snapshot until it has been through here: the version is checked, and older data is migrated.
 * Throws on versions this build does not know how to read.
 */
export function migrate(stored: unknown, version: number): SelectableSnapshot {
    if (!Number.isInteger(version) || version < 1) {
        throw new Error(`invalid schema version ${String(version)}`);
    }
    if (version > SCHEMA_VERSION) {
        throw new Error(
            `stored snapshot is at schema version ${version}, newer than ${SCHEMA_VERSION}`,
        );
    }
    if (!isDict(stored)) throw new Error('stored snapshot is not an object');

    let current = stored;
    for (let v = version; v < SCHEMA_VERSION; v++) {
        const step = MIGRATIONS[v];
        if (!step) throw new Error(`no migration from schema version ${v}`);
        current = step(current);
    }
    return current as SelectableSnapshot;
}
