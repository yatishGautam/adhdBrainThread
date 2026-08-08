/**
 * The only file allowed to import both `electron` and `@shared/ipc/channels`. Everything it
 * exposes is generated from `REQUEST_CHANNELS`/`EVENT_CHANNELS`, so a channel added to the type
 * map and forgotten here is caught by `CHANNELS_ARE_EXHAUSTIVE` at compile time, not at runtime.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { REQUEST_CHANNELS } from '@shared/ipc/channels.js';
import type { EventChannel, Events, Requests } from '@shared/ipc/channels.js';

const invoke = Object.fromEntries(
  REQUEST_CHANNELS.map((channel) => [
    channel,
    (payload: unknown) => ipcRenderer.invoke(channel, payload),
  ]),
) as { [K in keyof Requests]: (payload: Requests[K][0]) => Promise<Requests[K][1]> };

function on<K extends EventChannel>(channel: K, listener: (payload: Events[K]) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: Events[K]): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  invoke,
  on,
};

export type ThreadApi = typeof api;

contextBridge.exposeInMainWorld('thread', api);
