// A wand: its stats, its always-cast spells, and its deck.

import type { Wand } from '../../server/schema.ts';
import { mainSpellIds, wandSprite, type Dataset } from './data.ts';
import { ExternalLink } from './Icon.tsx';
import { SpellSlotView } from './Spell.tsx';
import { tip } from './tooltip.ts';
import { FRAMES_PER_SECOND, png } from './util.ts';

type StatKey =
    | 'shuffle_deck_when_empty'
    | 'actions_per_round'
    | 'fire_rate_wait'
    | 'reload_time'
    | 'mana_max'
    | 'mana_charge_speed'
    | 'deck_capacity'
    | 'spread_degrees'
    | 'speed_multiplier';

export type Stat = {
    /** The engine's field name, as the snapshot carries it */
    key: StatKey;
    /** What the game's UI calls it */
    label: string;
    classes: string;
    /** Query parameter name on the current wand simulator */
    sim: string;
    /** Query parameter name on the older simulator, where it differs from `key` */
    oldSim?: string;
};

/** The stats shown for a wand, in display order. */
const STATS: Stat[] = [
    { key: 'shuffle_deck_when_empty', label: 'Shuffle', classes: 'crisp shuffle-deck', sim: 'x' },
    { key: 'actions_per_round', label: 'Spells/Cast', classes: 'crisp spells-cast', sim: 'a' },
    {
        key: 'fire_rate_wait',
        label: 'Cast Delay',
        classes: 'crisp cast-delay',
        sim: 'd',
        oldSim: 'cast_delay',
    },
    { key: 'reload_time', label: 'Recharge Time', classes: 'crisp recharge-time', sim: 'r' },
    { key: 'mana_max', label: 'Mana Max', classes: 'crisp mana-max', sim: 'm' },
    { key: 'mana_charge_speed', label: 'Mana chg spd', classes: 'crisp mana-charge', sim: 'c' },
    { key: 'deck_capacity', label: 'Capacity', classes: 'crisp deck-capacity', sim: 'l' },
    {
        key: 'spread_degrees',
        label: 'Spread',
        classes: 'crisp wand-spread',
        sim: 'q',
        oldSim: 'spread',
    },
    { key: 'speed_multiplier', label: 'Speed', classes: 'crisp speed-mult', sim: 'v' },
];

/** A stat as the game's wand tooltip shows it. */
export function displayValue(wand: Wand, key: StatKey): string | number {
    switch (key) {
        case 'shuffle_deck_when_empty':
            return wand.shuffle_deck_when_empty ? 'Yes' : 'No';
        case 'fire_rate_wait':
        case 'reload_time':
            return (wand[key] / FRAMES_PER_SECOND).toFixed(2);
        case 'spread_degrees':
            return `${wand.spread_degrees.toFixed(1)} DEG`;
        case 'deck_capacity':
            // Always-cast spells occupy capacity that the game does not show.
            return wand.deck_capacity - wand.always_cast.length;
        case 'speed_multiplier':
            return `x ${wand.speed_multiplier.toFixed(2)}`;
        default:
            return wand[key].toFixed(0);
    }
}

/** A link that opens this wand in a simulator. Spells the simulators do not know become gaps. */
export function simulatorUrl(wand: Wand, base: string, paramName: (stat: Stat) => string): string {
    const stats = STATS.map((stat) => `${paramName(stat)}=${+wand[stat.key]}`).join('&');
    const deck = wand.deck
        .map((slot) => (slot && mainSpellIds.has(slot.action_id) ? slot.action_id : ''))
        .join('%2C');
    return `${base}${stats}&spells=${deck}`;
}

export function WandView({ wand, data }: { wand: Wand; data: Dataset }) {
    const sprite = wandSprite(wand.sprite_file);
    const tinker = simulatorUrl(
        wand,
        'https://tinker-with-wands-online.vercel.app/?',
        (s) => s.sim,
    );
    const oldTinker = simulatorUrl(
        wand,
        'https://noita-wand-simulator.salinecitrine.com/?',
        (s) => s.oldSim ?? s.key,
    );
    const deckSlots = Math.max(0, wand.deck_capacity - wand.always_cast.length);

    return (
        <div class="wand">
            <div class="stats-wrapper">
                <div class="stats-header">
                    <p class="stats-title">{wand.ui_name}</p>
                    <div class="shifts-tip wands-tip" {...tip('bottom')}>
                        <ExternalLink href={tinker}>
                            <p>Tinker</p>
                        </ExternalLink>
                        <div class="tooltip fit">
                            <ExternalLink href={oldTinker}>Old Tinker Link</ExternalLink>
                            <ul>
                                <li>Both wand simulation sites do NOT include Epilogue 2 Spells</li>
                                <li>
                                    If the wand includes Epilogue 2 Spells they are replaced with a
                                    blank slot
                                </li>
                                <li>
                                    "Projectile" simulator on Old Tinker is currently more
                                    informative
                                </li>
                                <li>
                                    Both sites have a top right configuration button:
                                    <ul>
                                        <li>
                                            This is saved per-user, these Tinker links have no
                                            impact on the configuration
                                        </li>
                                        <li>
                                            If you are comparing your simulation to in-game or
                                            someone else's simulation, make sure these settings are
                                            all valid/matching
                                        </li>
                                    </ul>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="stats">
                    <div class="stats-props">
                        {STATS.map((stat) => (
                            <p class={stat.classes}>{stat.label}</p>
                        ))}
                    </div>
                    <div class="stats-props">
                        {STATS.map((stat) => (
                            <p>{displayValue(wand, stat.key)}</p>
                        ))}
                    </div>
                    <div class={sprite.animated ? 'anim-wand-slot' : 'wand-slot'}>
                        <img src={png(sprite.image)} />
                    </div>
                </div>
            </div>
            {wand.always_cast.length > 0 && (
                <div class="mt-20">
                    <p>Always Cast:</p>
                    <div class="spells">
                        {wand.always_cast.map((spell) => (
                            <SpellSlotView slot={spell} data={data} alwaysCast />
                        ))}
                    </div>
                </div>
            )}
            <div class="mt-20">
                <p>Spells:</p>
                <div class="spells">
                    {Array.from({ length: deckSlots }, (_, i) => (
                        <SpellSlotView slot={wand.deck[i]} data={data} />
                    ))}
                </div>
            </div>
        </div>
    );
}
