// Where the page's data comes from: one request for who the streamer is and what the server
// last heard from them, then a websocket that delivers each new snapshot as their mod sends it.

import { useEffect, useState } from 'preact/hooks';

import type { Snapshot, StreamerResponse } from '../../server/schema.ts';

export type Feed =
    | { status: 'loading' }
    | { status: 'failed' }
    | {
          status: 'ready';
          displayName: string;
          /** The mod version the server hands out */
          currentModVersion: string;
          /** The newest snapshot received; null if the streamer has never sent one */
          snapshot: Snapshot | null;
      };

const RECONNECT_DELAY_MS = 3500;
const MAX_RECONNECTS = 10;

export function useStreamerFeed(name: string): Feed {
    const [streamer, setStreamer] = useState<StreamerResponse | 'failed' | null>(null);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

    // The request and the socket both deliver snapshots and can arrive in either order.
    const accept = (next: Snapshot) =>
        setSnapshot((current) =>
            current && current.received_at > next.received_at ? current : next,
        );

    useEffect(() => {
        fetch(`/api/streamer/${encodeURIComponent(name)}`)
            .then((res) => (res.ok ? (res.json() as Promise<StreamerResponse>) : Promise.reject()))
            .then(
                (body) => {
                    setStreamer(body);
                    if (body.snapshot) accept(body.snapshot);
                },
                () => setStreamer('failed'),
            );
    }, [name]);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let retries = 0;
        let stopped = false;

        const connect = () => {
            const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
            socket = new WebSocket(
                `${scheme}://${location.host}/client=${encodeURIComponent(name)}`,
            );
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
    }, [name]);

    if (streamer === null) return { status: 'loading' };
    if (streamer === 'failed') return { status: 'failed' };
    return {
        status: 'ready',
        displayName: streamer.streamer.display_name,
        currentModVersion: streamer.current_mod_version,
        snapshot,
    };
}
