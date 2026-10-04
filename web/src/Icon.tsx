// Pieces shared by everything that shows an icon with a tooltip: perks, items, and the cells of
// the progress tables.

import type { ComponentChildren } from 'preact';

type LinkProps = {
    href: string;
    /** -1 keeps the link out of the tab order, which is what an icon grid wants. */
    tabIndex?: number;
    children: ComponentChildren;
};

/** A link to another site, opened in a new tab. */
export function ExternalLink({ href, tabIndex = -1, children }: LinkProps) {
    return (
        <a href={href} tabIndex={tabIndex} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    );
}

/** `children` linked to a wiki page when there is one, and bare when there is not. */
export function WikiLink({ url, children }: { url?: string | null; children: ComponentChildren }) {
    return url ? <ExternalLink href={url}>{children}</ExternalLink> : <>{children}</>;
}

/** Text from the data files, which mark line breaks with a literal backslash-n. */
export function Lines({ text }: { text: string }) {
    return (
        <>
            {text.split('\\n').map((line, i) => (
                <>
                    {i > 0 && <br />}
                    {line}
                </>
            ))}
        </>
    );
}

type TooltipProps = {
    title: string;
    id: string;
    description?: string | null;
    /** `src` of the image shown beside the description */
    image: string;
    /** Extra class on the tooltip */
    class?: string;
    /** Lines shown between the id and the description */
    children?: ComponentChildren;
};

export function IconTooltip({
    title,
    id,
    description,
    image,
    class: extra,
    children,
}: TooltipProps) {
    return (
        <div class={extra ? `tooltip ${extra}` : 'tooltip'}>
            <p class="tooltip-title">{title}</p>
            <p class="tooltip-wiki">({id})</p>
            {children}
            <div class="desc-container">
                {description && (
                    <p class="tooltip-description">
                        <Lines text={description} />
                    </p>
                )}
                <img src={image} />
            </div>
        </div>
    );
}
