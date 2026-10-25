// The progress tables: every perk, spell and enemy in the game, lit when the streamer has
// unlocked it, with a search box over each.

import { useMemo, useState } from 'preact/hooks';

import type { Snapshot } from '../../server/schema.ts';
import type { Dataset, Icon, SpellInfo } from './data.ts';
import { IconTooltip, WikiLink } from './Icon.tsx';
import { DAMAGE_FIELDS, FRAME_FIELDS, SPELL_TYPES, SpellTooltip, spellInfo } from './Spell.tsx';
import { tip } from './tooltip.ts';
import { FRAMES_PER_SECOND, HP_PER_UNIT, png } from './util.ts';

type TableName = 'Perks' | 'Spells' | 'Enemies';

const SEARCH_HELP: Record<TableName, string> = {
    Perks: 'Search by perk name or ID',
    Spells: "Search by spell name, ID, or search by @tooltip such as: '@cast<0' or '@type=static'",
    Enemies:
        'Search by enemy name or ID, all icons try to link to wiki, but not all pages exist (or are name-matched)',
};

const INFO_ICON =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAg0lEQVR4nGP8//8/AymABZnDyMjIkJ2YcRxZbOr8GZbIhqJoyE7MOP7y+UsGdDEGBgZLGJ8JWRKmeM2O9ZZrdqy3RBbDagNMET7AhEsC5hcMQ/7//w/HyIpDPAKPY1OD1QZ0dyMDRmSTGRkZsSpCVoPVhuzEjOPo8QEDLNgEiXYSMQAA+jlJnW6J0BUAAAAASUVORK5CYII=';

// --------------------------------------------------------------------------------------------
// Search
//
// Plain text matches an icon's name or id. In the spells table, a search starting with @ matches
// on a tooltip stat instead: "@type=static", "@cast<0", "@mana drain>50".

/**
 * The stat names a viewer can type after @, and the engine fields each one covers. A search
 * matches the first name it is a pattern for, so the order of this list matters. The names
 * follow the tooltip's labels (TOOLTIP_STATS in Spell.tsx) but are not derived from them:
 * "speed" deliberately covers two fields.
 */
const SEARCHABLE_STATS: Record<string, string[]> = {
    type: ['action_type'],
    'uses remaining': ['action_max_uses'],
    'mana drain': ['action_mana_drain'],
    damage: ['action_projectile', 'damage_projectile_add'],
    'dmg. ice': ['action_ice', 'damage_ice_add'],
    'dmg. slice': ['action_slice'],
    'dmg. drill': ['action_drill'],
    'dmg. fire': ['action_fire'],
    'dmg. healing': ['action_healing'],
    'dmg. holy': ['action_holy'],
    'dmg. melee': ['action_melee'],
    'dmg. electric': ['action_electricity', 'damage_electricity_add'],
    speed: ['action_speed', 'speed_multiplier'],
    'cast delay': ['fire_rate_wait'],
    'proj. speed': ['speed_multiplier'],
    'recharge time': ['reload_time'],
    'dmg. expl': ['action_explosion', 'damage_explosion_add'],
    'expl. radius': ['explosion_radius'],
    bounces: ['bounces'],
    spread: ['spread_degrees'],
    'crit. chance': ['damage_critical_chance'],
};

/**
 * What a search makes of one icon: `found` is highlighted, `hidden` is dimmed, and `neutral`
 * is left alone, which is every icon when there is no search.
 */
export type Match = 'found' | 'hidden' | 'neutral';
type Matcher = (icon: Pick<Icon, 'id' | 'name'>, spell: SpellInfo | undefined) => Match;

const NEUTRAL: Matcher = () => 'neutral';

/** A matcher for an @ search, given the text after the @. */
function statMatcher(query: string): Matcher {
    const statName = Object.keys(SEARCHABLE_STATS).find((name) =>
        name.match(new RegExp(query.split(/[=><]/)[0]!)),
    );
    if (!statName) return NEUTRAL;
    const fields = SEARCHABLE_STATS[statName]!;

    /** Decides a spell that has the stat. With no comparison in the search, having it is enough. */
    let test: (meta: Record<string, number>) => Match = () => 'found';
    if (/type=/.test(query)) {
        // Nothing is decided until a type name has been started.
        const wanted = query.split(/=+/)[1];
        if (!wanted) return NEUTRAL;
        const pattern = new RegExp(wanted);
        const type = SPELL_TYPES.findIndex((t) => t.search.match(pattern));
        test = (meta) => (meta.action_type === type ? 'found' : 'hidden');
    } else if (/[><]/.test(query)) {
        const [, operator, operand] = query.split(/([><])+/);
        if (!operand) return NEUTRAL;
        const field = fields[0]!;
        // The number is typed as the tooltip shows it, in hit points or seconds. Convert it to
        // the units the stat is stored in before comparing.
        let value = parseFloat(operand);
        if (DAMAGE_FIELDS.has(field)) value /= HP_PER_UNIT;
        else if (FRAME_FIELDS.has(field)) value *= FRAMES_PER_SECOND;
        test = (meta) =>
            (operator === '>' ? meta[field]! > value : meta[field]! < value) ? 'found' : 'hidden';
    }

    return (_icon, spell) => {
        const meta = spell?.meta;
        if (!meta || !fields.some((field) => Object.hasOwn(meta, field))) return 'hidden';
        return test(meta);
    };
}

/** How each icon in a table responds to what is in its search box. */
export function matcher(search: string): Matcher {
    const query = search.toLowerCase();
    if (query === '') return NEUTRAL;
    if (query.startsWith('@')) {
        try {
            return statMatcher(query.slice(1));
        } catch {
            // What is typed after @ is used as a pattern, and a half-typed one can be invalid.
            return NEUTRAL;
        }
    }
    return (icon) =>
        icon.id.toLowerCase().includes(query) || icon.name.toLowerCase().includes(query)
            ? 'found'
            : 'hidden';
}

// --------------------------------------------------------------------------------------------

const ICON_BG_STYLE = 'width: 38px; height: 38px; left: -1px; top: -1px; opacity: 0.5';

type IconProps = {
    icon: Icon;
    /** The spell's details, in the spells table */
    spell: SpellInfo | undefined;
    lit: boolean;
    match: Match;
};

function IconCell({ icon, spell, lit, match }: IconProps) {
    const classes = [
        'icon-slot',
        !lit && 'bgHide',
        spell && 'spellTip',
        match === 'hidden' && 'searchHide',
        match === 'found' && 'highlight',
    ];
    return (
        <div class={classes.filter(Boolean).join(' ')} {...tip('bottom', [0, 35])}>
            <div class="zoom">
                {icon.bgImage && <img style={ICON_BG_STYLE} src={png(icon.bgImage)} />}
                <WikiLink url={icon.wiki_url}>
                    <img data-tip-ref src={png(icon.image)} />
                </WikiLink>
            </div>
            {spell ? (
                <SpellTooltip info={spell} />
            ) : (
                <IconTooltip
                    title={icon.name}
                    id={icon.id}
                    description={icon.description}
                    image={png(icon.image)}
                />
            )}
        </div>
    );
}

type TableProps = {
    table: TableName;
    /** Icons per row */
    columns: number;
    icons: Icon[];
    /** Ids the streamer has unlocked */
    unlocked: string[];
    data: Dataset;
    invert: boolean;
};

function ProgressTable({ table, columns, icons, unlocked, data, invert }: TableProps) {
    const [search, setSearch] = useState('');

    // Only what this table lists counts towards its total. Each snapshot brings a new array
    // with (usually) the same ids, so this is keyed on the ids rather than on the array.
    const have = useMemo(() => {
        const listed = new Set(icons.map((icon) => icon.id));
        return new Set(unlocked.filter((id) => listed.has(id)));
    }, [icons, unlocked.join(',')]);

    // The grid is several hundred icons, each with a tooltip. It is rebuilt only when something
    // it shows has changed, not on every snapshot.
    const { grid, found } = useMemo(() => {
        const match = matcher(search);
        let found = 0;
        const grid = icons.map((icon) => {
            const spell = table === 'Spells' ? spellInfo(icon.id, data) : undefined;
            const result = match(icon, spell);
            if (result === 'found') found += 1;
            return (
                <IconCell
                    key={icon.id}
                    icon={icon}
                    spell={spell}
                    lit={have.has(icon.id) !== invert}
                    match={result}
                />
            );
        });
        return { grid, found };
    }, [icons, have, data, invert, search, table]);

    return (
        <div class="prog" style={`width: ${1.85 * columns}rem`}>
            <div class="header" data-tip-ref>
                <div class="stats-wrap">
                    <div class="stats">
                        <span>
                            {table} - {((100 * have.size) / icons.length).toFixed(1)}%
                        </span>
                        <span>
                            {have.size}/{icons.length}
                        </span>
                        {search !== '' && <span>({found} found)</span>}
                    </div>
                    <div class="tip" {...tip('top', [0, 5])}>
                        <img src={INFO_ICON} />
                        <div class="tooltip">
                            <p>{SEARCH_HELP[table]}</p>
                        </div>
                    </div>
                </div>
                <div class="search-wrap">
                    <input
                        class="search"
                        type="text"
                        value={search}
                        tabIndex={1}
                        placeholder={`Search ${table}`}
                        onInput={(event) => setSearch(event.currentTarget.value)}
                    />
                </div>
            </div>
            <div class="spells">{grid}</div>
        </div>
    );
}

type Props = {
    progress: Snapshot['progress'];
    data: Dataset;
    invert: boolean;
};

export function ProgressTables({ progress, data, invert }: Props) {
    return (
        <div class="prog-wrapper">
            <div class="top-border"></div>
            <ProgressTable
                table="Perks"
                columns={9}
                icons={data.perks}
                unlocked={progress.perks}
                data={data}
                invert={invert}
            />
            <ProgressTable
                table="Spells"
                columns={12}
                icons={data.spellIcons}
                unlocked={progress.spells}
                data={data}
                invert={invert}
            />
            <ProgressTable
                table="Enemies"
                columns={9}
                icons={data.enemies}
                unlocked={progress.enemies}
                data={data}
                invert={invert}
            />
        </div>
    );
}
