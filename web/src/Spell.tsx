// A spell in a slot, the tooltip describing it, and what the page knows about spell stats.

import type { SpellSlot } from '../../server/schema.ts';
import type { Dataset, SpellInfo } from './data.ts';
import { tip } from './tooltip.ts';
import { FRAMES_PER_SECOND, HP_PER_UNIT, png } from './util.ts';

/** A spell's stats and description, with a placeholder for ids the data set does not know. */
export function spellInfo(id: string, data: Dataset): SpellInfo {
    return (
        data.spells[id] ?? {
            name: id,
            description:
                "Either this spell is missing from onlywands or it is modded and onlywands doesn't support this mod yet",
            sprite: data.missingSpell.image,
        }
    );
}

const USES_STYLE =
    'font-size: 18px; position: relative; left: 1px; top: -2px; ' +
    'text-shadow: -2px 0 black, 0 2px black, 2px 0 black, 0 -2px black';
const SLOT_BG_STYLE = 'width: 35px; height: 35px; top: 0px; left: 0px';

type SlotProps = {
    /** null or undefined is an empty slot */
    slot: SpellSlot | undefined;
    data: Dataset;
    /** Always-cast spells never show a remaining-uses count. */
    alwaysCast?: boolean;
};

export function SpellSlotView({ slot, data, alwaysCast = false }: SlotProps) {
    if (!slot) return <div class="spell-slot"></div>;
    const info = spellInfo(slot.action_id, data);
    const icon = data.spellIcon.get(slot.action_id) ?? data.missingSpell;
    const uses = slot.uses_remaining;
    // uses_remaining is the engine's value: -1 is unlimited, null means the mod did not say.
    const showUses = uses !== null && uses > -1 && !alwaysCast;
    return (
        <div class="spell-slot" {...tip('bottom', [0, 35])}>
            {icon.bgImage && <img style={SLOT_BG_STYLE} src={png(icon.bgImage)} />}
            <img data-tip-ref class="spellZoom" src={png(info.sprite)} />
            {showUses && <p style={USES_STYLE}>{uses}</p>}
            <SpellTooltip info={info} />
        </div>
    );
}

// --------------------------------------------------------------------------------------------
// Spell stats
//
// Stats are engine field names with numeric values. Damage fields are in units of
// HP_PER_UNIT hit points, and time fields are frame counts.

/**
 * Spell types, indexed by the engine's action_type. `label` is what the tooltip shows and
 * `search` is the name a search matches against.
 */
export const SPELL_TYPES: { label: string; search: string }[] = [
    { label: 'Projectile', search: 'projectile' },
    { label: 'Static Projectile', search: 'static projectile' },
    { label: 'Proj. modifier', search: 'projectile modifier' },
    { label: 'Multicast', search: 'multicast' },
    { label: 'Material', search: 'material' },
    { label: 'Other', search: 'other' },
    { label: 'Utility', search: 'utility' },
    { label: 'Passive', search: 'passive' },
];

/** Damage a spell deals itself. The game rounds these up when showing them. */
const DAMAGE_ROUNDED_UP = [
    'action_healing',
    'action_holy',
    'action_melee',
    'action_fire',
    'action_projectile',
];
/** Damage a spell deals itself that the game rounds down. */
const DAMAGE_ROUNDED_DOWN = [
    'action_slice',
    'action_drill',
    'action_ice',
    'action_electricity',
    'action_explosion',
];
/** Damage a modifier adds to other spells, shown with a sign. */
const DAMAGE_ADDED = ['damage_ice_add', 'damage_electricity_add', 'damage_explosion_add'];

export const DAMAGE_FIELDS = new Set([
    ...DAMAGE_ROUNDED_UP,
    ...DAMAGE_ROUNDED_DOWN,
    ...DAMAGE_ADDED,
    'damage_projectile_add',
]);
export const FRAME_FIELDS = new Set(['fire_rate_wait', 'reload_time']);

/** Tooltip rows, in display order: label, icon classes, and the engine field the value is in. */
const TOOLTIP_STATS: { label: string; classes: string; key: string }[] = [
    { label: 'Type', classes: 'crisp action-type', key: 'action_type' },
    { label: 'Uses remaining', classes: 'crisp max-uses', key: 'action_max_uses' },
    { label: 'Mana drain', classes: 'crisp mana-drain', key: 'action_mana_drain' },
    { label: 'Damage', classes: 'crisp dmg-projectile', key: 'action_projectile' },
    { label: 'Dmg. Slice', classes: 'crisp dmg-slice', key: 'action_slice' },
    { label: 'Dmg. Drill', classes: 'crisp dmg-drill', key: 'action_drill' },
    { label: 'Dmg. Ice', classes: 'crisp dmg-ice', key: 'action_ice' },
    { label: 'Dmg. Ice', classes: 'crisp dmg-ice', key: 'damage_ice_add' },
    { label: 'Dmg. Fire', classes: 'crisp dmg-fire', key: 'action_fire' },
    { label: 'Dmg. Healing', classes: 'crisp dmg-healing', key: 'action_healing' },
    { label: 'Dmg. Holy', classes: 'crisp dmg-holy', key: 'action_holy' },
    { label: 'Dmg. Melee', classes: 'crisp dmg-melee', key: 'action_melee' },
    { label: 'Dmg. Electric', classes: 'crisp dmg-electric', key: 'action_electricity' },
    { label: 'Dmg. Electric', classes: 'crisp dmg-electric', key: 'damage_electricity_add' },
    { label: 'Speed', classes: 'crisp speed-mult', key: 'action_speed' },
    { label: 'Cast delay', classes: 'crisp cast-delay', key: 'fire_rate_wait' },
    { label: 'Proj. Speed', classes: 'crisp speed-mult', key: 'speed_multiplier' },
    { label: 'Recharge time', classes: 'crisp recharge-time', key: 'reload_time' },
    { label: 'Dmg. Expl', classes: 'crisp dmg-explosion', key: 'action_explosion' },
    { label: 'Expl. Radius', classes: 'crisp explosion-radius', key: 'explosion_radius' },
    { label: 'Dmg. Expl', classes: 'crisp dmg-explosion', key: 'damage_explosion_add' },
    { label: 'Bounces', classes: 'crisp bounces', key: 'bounces' },
    { label: 'Spread', classes: 'crisp wand-spread', key: 'spread_degrees' },
    { label: 'Crit. Chance', classes: 'crisp dmg-crit-chance', key: 'damage_critical_chance' },
    { label: 'Damage', classes: 'crisp dmg-projectile', key: 'damage_projectile_add' },
];

const signed = (n: number, text: string | number = n): string => `${n > 0 ? '+' : ''}${text}`;

/**
 * Format one stat the way the game's own tooltip shows it. Returns undefined for a value that
 * should not be listed at all.
 */
export function formatStat(key: string, value: number): string | number | undefined {
    if (key === 'action_type') return SPELL_TYPES[value]?.label;
    if (DAMAGE_ROUNDED_UP.includes(key)) return Math.ceil(value * HP_PER_UNIT);
    if (DAMAGE_ROUNDED_DOWN.includes(key)) return Math.floor(value * HP_PER_UNIT);
    if (DAMAGE_ADDED.includes(key)) return signed(value, Math.floor(value * HP_PER_UNIT));
    if (key === 'damage_projectile_add') return signed(value, Math.ceil(value * HP_PER_UNIT));
    if (FRAME_FIELDS.has(key)) {
        return `${signed(value, (value / FRAMES_PER_SECOND).toFixed(2).replace('.00', '.0'))} s`;
    }
    switch (key) {
        case 'speed_multiplier':
            // A multiplier of exactly 1 changes nothing and is not shown.
            return value !== 1 ? `x ${value.toFixed(2)}` : undefined;
        case 'spread_degrees':
            return `${signed(value, value.toFixed(0))} DEG`;
        case 'bounces':
            return signed(value);
        case 'damage_critical_chance':
            return `${signed(value)}%`;
        default:
            return value;
    }
}

export function SpellTooltip({ info }: { info: SpellInfo }) {
    const meta = info.meta ?? {};
    return (
        <div class="tooltip">
            <p class="tooltip-title">{info.name ? info.name.toUpperCase() : 'UNKNOWN'}</p>
            <p class="tooltip-description">{info.description}</p>
            {TOOLTIP_STATS.map((stat, index) => {
                const value = meta[stat.key];
                const shown = value === undefined ? undefined : formatStat(stat.key, value);
                if (shown === undefined) return null;
                return (
                    <>
                        <p class={stat.classes}>
                            {stat.label} <span>{shown} </span>
                        </p>
                        {/* Stats are laid out three to a line, by position in the full list. */}
                        {(index + 1) % 3 === 0 && <br />}
                    </>
                );
            })}
            <img src={png(info.sprite)} />
        </div>
    );
}
