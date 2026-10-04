// The player panel: health, gold, orbs, and the perks picked up this run.

import { useState } from 'preact/hooks';

import type { Player } from '../../server/schema.ts';
import type { Dataset, Icon } from './data.ts';
import { IconTooltip, WikiLink } from './Icon.tsx';
import { useCreatureShiftImage } from './images.ts';
import { Toggle } from './Toggle.tsx';
import { tip } from './tooltip.ts';
import { HP_PER_UNIT, png } from './util.ts';

// --------------------------------------------------------------------------------------------
// Health
//
// hp and max_hp are strings in game units. They are strings because players reach values no
// number survives: beyond 2^63 the game shows infinity, and the engine itself reports "inf"
// and "nan". Large values arrive in exponent form, such as "1.5e+20".

/** The value of an exponent-form string as an exact integer, multiplied by `scale`. */
function exact(hp: string, scale = 1n): bigint {
    const [mantissa, exponent] = hp.split('e+') as [string, string];
    return (
        BigInt(Math.ceil(Number(mantissa) * 1e3)) *
        scale *
        10n ** BigInt(Math.max(0, Number(exponent) - 3))
    );
}

/** True when `hp` is at least `n`. Only exponent-form values can be that big. */
const atLeast = (hp: string, n: bigint): boolean => hp.includes('e+') && exact(hp) >= n;

/** Hit points as shown on screen. */
const hitPoints = (hp: string): number | bigint =>
    hp.includes('e+') ? exact(hp, BigInt(HP_PER_UNIT)) : Number(hp) * HP_PER_UNIT;

const isEngineSpecial = (hp: string): boolean => /nan|inf/i.test(hp);

const compact = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumSignificantDigits: 4,
});
const scientific = new Intl.NumberFormat(undefined, { notation: 'scientific' });
const compactMoney = new Intl.NumberFormat('en-US', { notation: 'compact' });

export type Health = {
    /** Show an infinity sign in place of the short forms. */
    infinite: boolean;
    /** Hit points in full, for the tooltip */
    hp: string;
    maxHp: string;
    /** Hit points abbreviated, e.g. "1.2K" */
    shortHp: string;
    shortMaxHp: string;
};

export function describeHealth(player: Pick<Player, 'hp' | 'max_hp'>): Health {
    const both = [player.hp, player.max_hp];
    // Values the engine itself cannot represent are shown as the engine reports them.
    if (both.some(isEngineSpecial) || both.some((hp) => atLeast(hp, 10n ** 308n))) {
        const hp = `Engine ${player.hp}`;
        const maxHp = `Engine ${player.max_hp}`;
        return { infinite: false, hp, maxHp, shortHp: hp, shortMaxHp: maxHp };
    }

    // Past 10^18 a double no longer holds the value exactly.
    const huge = both.some((hp) => atLeast(hp, 10n ** 18n));
    const full = (hp: string) =>
        huge ? scientific.format(hitPoints(hp)) : hitPoints(hp).toLocaleString();
    const short = (hp: string) => compact.format(hitPoints(hp));

    return {
        // The game's own counter overflows a signed 64-bit integer here and shows infinity.
        infinite: both.some((hp) => atLeast(hp, 2n ** 63n)),
        hp: full(player.hp),
        maxHp: full(player.max_hp),
        shortHp: short(player.hp),
        shortMaxHp: short(player.max_hp),
    };
}

/** The game shows infinity once gold reaches the largest signed 32-bit integer. */
const MAX_GOLD = 2 ** 31 - 1;

// --------------------------------------------------------------------------------------------
// Perks

type Perk = Player['perks'][number];

/**
 * The mod reports an Apotheosis creature shift as a perk whose id is this prefix followed by
 * the id of the creature shifted into.
 */
const CREATURE_SHIFT_PREFIX = '$status_apotheosis_creature_shifted_name_';

const perkImage = (icon: Icon): string => png(icon.ui_img ?? icon.image);

/**
 * What to show for a perk the game reported by id.
 *
 * `icon` always has the reported id. For a creature shift whose creature is known, `shift`
 * names the creature and the empty frame to draw it in; the icon's own image is then only a
 * stand-in.
 */
export function resolvePerk(
    id: string,
    data: Dataset,
): { icon: Icon; shift: { creature: Icon; frame: Icon } | null } {
    // Real perks first, then the pseudo-perks: essences, curses and the like.
    const known = data.perkByUiName.get(id) ?? data.pseud.get(id);
    if (known) return { icon: known, shift: null };

    // A creature shift has no icon of its own; it is the creature drawn in an empty frame.
    const frame = data.pseud.get('creature_shift_ui');
    if (frame && id.startsWith(CREATURE_SHIFT_PREFIX)) {
        const creature = data.enemy.get(id.slice(CREATURE_SHIFT_PREFIX.length));
        return { icon: { ...frame, id }, shift: creature ? { creature, frame } : null };
    }
    return { icon: { ...data.missingPerk, id }, shift: null };
}

function PerkView({ perk, data }: { perk: Perk; data: Dataset }) {
    const { icon, shift } = resolvePerk(perk.id, data);
    const composed = useCreatureShiftImage(
        shift && {
            creatureId: shift.creature.id,
            creature: shift.creature.image,
            frame: shift.frame.image,
        },
    );
    const image = composed ?? perkImage(icon);

    return (
        <div class="icon-slot no-bg" {...tip('bottom', [0, 10])}>
            <div class="zoom no-bg">
                <WikiLink url={icon.wiki_url}>
                    <img data-tip-ref src={image} />
                </WikiLink>
            </div>
            <IconTooltip
                title={`${perk.count} x ${icon.name}`}
                id={icon.id}
                description={icon.description}
                image={image}
            />
        </div>
    );
}

/** This many perks always show; the rest sit behind the "Show All Perks" switch. */
const ALWAYS_SHOWN = 8;

// --------------------------------------------------------------------------------------------

export function PlayerPanel({ player, data }: { player: Player; data: Dataset }) {
    const [showAll, setShowAll] = useState(false);
    const health = describeHealth(player);
    const shown = showAll ? player.perks : player.perks.slice(0, ALWAYS_SHOWN);

    return (
        <div class="info-wrapper">
            <div class="player-info">
                <div class="tip" {...tip('bottom')}>
                    <p class="health" data-tip-ref>
                        {health.infinite ? '∞ / ∞' : `${health.shortHp} / ${health.shortMaxHp}`}
                    </p>
                    <p class="tooltip fit">
                        HP: {health.hp} / {health.maxHp}
                    </p>
                </div>
                <div class="tip" {...tip('bottom')}>
                    <p class="money" data-tip-ref>
                        {player.money < MAX_GOLD ? compactMoney.format(player.money) : '∞'}
                    </p>
                    <p class="tooltip fit">$: {player.money.toLocaleString('en-US')}</p>
                </div>
                <div class="tip">
                    <p class="orb">{player.orbs}</p>
                </div>
                <Toggle checked={showAll} onChange={setShowAll} title="Show All Perks" />
                <div class="perks">
                    {shown.map((perk) => (
                        <PerkView key={perk.id} perk={perk} data={data} />
                    ))}
                    {!showAll && player.perks.length > ALWAYS_SHOWN && (
                        <div class="icon-slot no-bg more"></div>
                    )}
                </div>
            </div>
        </div>
    );
}
