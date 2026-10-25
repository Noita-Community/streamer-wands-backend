// Small helpers shared by the pages.

/** The engine stores health and damage in units worth this many hit points on screen. */
export const HP_PER_UNIT = 25;

/** The engine stores times as frame counts; the game shows seconds. */
export const FRAMES_PER_SECOND = 60;

/** `src` for a base64 PNG, the form every sprite in the data files takes. */
export const png = (base64: string): string => `data:image/png;base64,${base64}`;

/**
 * The streamer name in the page's URL, /streamer/<name>. Both pages served under that path are
 * the same file for every streamer; this is how they know which one was asked for.
 */
export function streamerNameFromLocation(): string {
    const segment = location.pathname.split('/').filter(Boolean).at(-1) ?? '';
    try {
        return decodeURIComponent(segment);
    } catch {
        // Not valid percent-encoding. Use it as typed; the server will not know it either way.
        return segment;
    }
}
