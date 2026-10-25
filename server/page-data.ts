// The data the server writes into each page as it serves it (see pages.ts). The pages import
// these types, so this file must not import anything that only exists in Node.

import type { Snapshot } from './schema.ts';

/** For the viewer page, /streamer/<name>. */
export type StreamerPageData = {
    streamer: { login: string | null; display_name: string };
    /** The websocket address that delivers this streamer's snapshots as they arrive */
    feed_url: string;
    /** The newest mod version this server hands out; the page warns when the streamer's differs. */
    current_mod_version: string;
    /** What the server last received; null when the streamer has never sent anything */
    snapshot: Snapshot | null;
};

/** For the front page, /. */
export type IndexPageData = {
    /** Who is logged in; null when nobody is */
    user: { login: string | null; display_name: string } | null;
    /** The mod versions available to download, newest first */
    versions: string[];
};
