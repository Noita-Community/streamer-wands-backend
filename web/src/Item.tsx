// An item in one of the inventory's item slots: potions, pouches, tablets and the like.

import type { ItemSlot } from '../../server/schema.ts';
import { container, itemData, type Container } from './data.ts';
import { IconTooltip } from './Icon.tsx';
import { useContainerImage } from './images.ts';
import { tip } from './tooltip.ts';
import { png } from './util.ts';

type Item = Extract<ItemSlot, { kind: 'item' }>;

/** Whether anything about the item, including what it holds, comes from the Apotheosis mod. */
const isApotheosis = (item: Item): boolean =>
    [
        item.ui_sprite,
        item.item_name,
        item.ui_description,
        ...item.contents.flatMap((c) => [c.ui_name, c.material]),
    ].some((text) => text.includes('potheosis'));

export type ItemView = {
    id: string;
    /** e.g. "Water+Oil Potion (62% full)", or just the item's name when it holds nothing */
    title: string;
    description: string;
    /** base64 PNG of the item, empty */
    sprite: string;
    container: Container;
    /** What it holds as percentages of its capacity, largest first */
    contents: { material: string; ui_name: string; percent: number }[];
    /** 0 to 100 */
    fullness: number;
    /** The contents' colour, packed as ABGR; null when it holds nothing */
    color: number | null;
    /** Tablets and books, which the game labels in green */
    book: boolean;
};

/**
 * Work out what to show for a slot. null for anything that cannot be shown: no item, a
 * descriptor the server could not parse, an item the data files do not know, or Apotheosis
 * content while that is off.
 */
export function describeItem(slot: ItemSlot | undefined, apothContent: boolean): ItemView | null {
    if (slot?.kind !== 'item') return null;
    if (!apothContent && isApotheosis(slot)) return null;

    // The game stores translation keys with a leading $; the item data is keyed without it.
    const id = slot.item_name.replace(/^\$/, '');
    const info = Object.hasOwn(itemData, id) ? itemData[id]! : null;
    // Apotheosis ships copies of the base game's item sprites under its own path.
    const path = slot.ui_sprite.replace(/mods\/apotheosis\/files/gi, 'data');
    const sprite = info?.sprite[path];
    const description = info?.description[slot.ui_description.replace(/^\$/, '')];
    if (!info || sprite === undefined || description === undefined) return null;

    const kind = container(path);
    const contents = slot.contents
        .map((c) => ({
            material: c.material,
            ui_name: c.ui_name,
            percent: c.amount / kind.unitsPerPercent,
        }))
        .sort((a, b) => b.percent - a.percent);
    const fullness = contents.reduce((sum, c) => sum + c.percent, 0);

    return {
        id,
        title:
            contents.length > 0
                ? `${contents.map((c) => c.ui_name).join('+')} ${info.name} (${Math.floor(fullness)}% full)`
                : info.name,
        description,
        sprite,
        container: kind,
        contents,
        fullness,
        color: contents.length > 0 ? slot.color : null,
        book: id.includes('book'),
    };
}

type Props = {
    /** null or undefined is an empty slot */
    slot: ItemSlot | undefined;
    apothContent: boolean;
};

export function ItemSlotView({ slot, apothContent }: Props) {
    const item = describeItem(slot, apothContent);
    const filled = useContainerImage(
        item && item.color !== null
            ? {
                  sprite: item.sprite,
                  container: item.container,
                  color: item.color,
                  fullness: item.fullness,
              }
            : null,
    );
    if (!item) return <div class="item-slot"></div>;

    // Until the filled image has been composed, the empty container stands in.
    const image = filled ?? png(item.sprite);

    return (
        <div class="item-slot" {...tip('bottom', [0, 35])}>
            <img data-tip-ref src={image} />
            <IconTooltip
                title={item.title}
                id={item.id}
                description={item.description}
                image={image}
                class={item.book ? 'book' : undefined}
            >
                {item.contents.map((c) => (
                    <p class="tooltip-description">
                        {Math.ceil(c.percent)}% {c.ui_name} ({c.material})
                    </p>
                ))}
            </IconTooltip>
        </div>
    );
}
