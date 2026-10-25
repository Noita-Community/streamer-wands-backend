// Tooltip placement.
//
// Showing and hiding is done by the stylesheet: a tooltip is visible while its host is hovered.
// This module only decides where it goes, using Floating UI to keep it next to its reference
// element and inside the viewport.
//
// Spread `tip(...)` onto the host, the element whose :hover shows the tooltip:
//
//   <div class="spell-slot" {...tip('bottom', [0, 35])}>
//       <img data-tip-ref ... />
//       <div class="tooltip">...</div>
//   </div>
//
// The tooltip is the first `.tooltip` inside the host. It is positioned against the element
// marked `data-tip-ref`: one inside the host if there is one, otherwise the nearest one around
// it, otherwise the host itself. A caller can instead supply its own reference, which may be
// a rectangle that is not any one element's; see `beside`.

import {
    computePosition,
    flip,
    offset,
    shift,
    type Placement,
    type ReferenceElement,
} from '@floating-ui/dom';

/** How to find what a tooltip is positioned against, given its host. */
type Reference = (host: HTMLElement) => ReferenceElement;

const markedReference: Reference = (host) =>
    host.querySelector<HTMLElement>('[data-tip-ref]') ??
    host.closest<HTMLElement>('[data-tip-ref]') ??
    host;

/**
 * A reference as wide as the nearest ancestor matching `widthOf` and as tall as the nearest one
 * matching `heightOf`. Placed left or right, the tooltip then sits outside the wider element,
 * level with the narrower one: beside a table, aligned with the hovered row.
 */
export function beside(widthOf: string, heightOf: string): Reference {
    return (host) => {
        const wide = host.closest<HTMLElement>(widthOf) ?? host;
        const tall = host.closest<HTMLElement>(heightOf) ?? host;
        return {
            contextElement: tall,
            getBoundingClientRect: () => {
                const { left, right, width } = wide.getBoundingClientRect();
                const { top, bottom, height } = tall.getBoundingClientRect();
                return { x: left, y: top, left, right, top, bottom, width, height };
            },
        };
    };
}

function place(
    host: HTMLElement,
    placement: Placement,
    [skidding, distance]: [number, number],
    reference: Reference,
) {
    const tooltip = host.querySelector<HTMLElement>('.tooltip');
    if (!tooltip) return;

    void computePosition(reference(host), tooltip, {
        placement,
        strategy: 'absolute',
        middleware: [
            offset({ crossAxis: skidding, mainAxis: distance }),
            // Swap sides when the chosen one lacks room, and turn to the other axis when both do.
            // Only room on the flipping axis counts: a tooltip that sticks out along the other
            // axis is slid back by shift() below, not flipped.
            flip({ crossAxis: false, fallbackAxisSideDirection: 'end' }),
            shift({ padding: 5 }),
        ],
    }).then(({ x, y, placement: chosen }) => {
        // Where it ended up, for anyone inspecting the page.
        tooltip.dataset['placement'] = chosen;
        // The stylesheet gives every tooltip a default position; this overrides it inline.
        Object.assign(tooltip.style, {
            position: 'absolute',
            inset: '0 auto auto 0',
            margin: '0',
            transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`,
        });
    });
}

/**
 * Props that position the host's tooltip whenever the pointer enters it. `offset` is
 * [skidding along the reference, distance away from it] in pixels.
 */
export function tip(
    placement: Placement,
    offset: [number, number] = [0, 0],
    reference: Reference = markedReference,
): { onMouseEnter: (event: MouseEvent) => void } {
    return {
        onMouseEnter: (event) =>
            place(event.currentTarget as HTMLElement, placement, offset, reference),
    };
}
