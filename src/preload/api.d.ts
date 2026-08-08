/**
 * Ambient type for `window.thread`, so every renderer file gets full autocomplete and type
 * checking against the same `Requests`/`Events` map the main process handles.
 */
import type { EventChannel, Events, Requests } from '@shared/ipc/channels.js';

export interface ThreadBridge {
  invoke: { [K in keyof Requests]: (payload: Requests[K][0]) => Promise<Requests[K][1]> };
  on: <K extends EventChannel>(channel: K, listener: (payload: Events[K]) => void) => () => void;
}

declare global {
  interface Window {
    thread: ThreadBridge;
  }
}

export {};
