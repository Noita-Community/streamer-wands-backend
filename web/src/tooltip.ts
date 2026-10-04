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
// it, otherwise the host itself.

import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';

function place(host: HTMLElement, placement: Placement, [skidding, distance]: [number, number]) {
    const tooltip = host.querySelector<HTMLElement>('.tooltip');
    if (!tooltip) return;
    const reference =
        host.querySelector<HTMLElement>('[data-tip-ref]') ??
        host.closest<HTMLElement>('[data-tip-ref]') ??
        host;

    void computePosition(reference, tooltip, {
        placement,
        strategy: 'absolute',
        middleware: [
            offset({ crossAxis: skidding, mainAxis: distance }),
            flip(),
            shift({ padding: 5 }),
        ],
    }).then(({ x, y }) => {
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
): { onMouseEnter: (event: MouseEvent) => void } {
    return {
        onMouseEnter: (event) => place(event.currentTarget as HTMLElement, placement, offset),
    };
}
