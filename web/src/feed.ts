// The streamer's newest snapshot: the one the page was served with, then each one their mod
// sends, delivered over a websocket.

import { useEffect, useState } from 'preact/hooks';

import type { Snapshot } from '../../server/schema.ts';

const RECONNECT_DELAY_MS = 3500;
const MAX_RECONNECTS = 10;

/**
 * `initial` is the snapshot the page was served with, null if the streamer has sent none.
 * `feedUrl` is the websocket address later ones arrive on.
 */
export function useLatestSnapshot(initial: Snapshot | null, feedUrl: string): Snapshot | null {
    const [snapshot, setSnapshot] = useState(initial);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let retries = 0;
        let stopped = false;

        // The socket sends the current snapshot on connecting, which after a reconnect may be
        // older than one already shown.
        const accept = (next: Snapshot) =>
            setSnapshot((current) =>
                current && current.received_at > next.received_at ? current : next,
            );

        const connect = () => {
            socket = new WebSocket(feedUrl);
            socket.onmessage = (message) => {
                try {
                    accept(JSON.parse(message.data as string) as Snapshot);
                } catch {
                    // Not JSON, so not a snapshot.
                }
            };
            socket.onclose = () => {
                if (stopped || retries >= MAX_RECONNECTS) return;
                retry = setTimeout(() => {
                    retries += 1;
                    connect();
                }, RECONNECT_DELAY_MS);
            };
        };
        connect();
        return () => {
            stopped = true;
            clearTimeout(retry);
            socket?.close();
        };
    }, [feedUrl]);

    return snapshot;
}
