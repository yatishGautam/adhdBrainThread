import { create } from 'zustand';
import type { Thread } from '@shared/domain.js';

interface ThreadStore {
  threads: Thread[];
  loaded: boolean;
  setThreads: (threads: Thread[]) => void;
}

/** Populated once on boot, then kept live by the 'threads:changed' broadcast — no polling. */
export const useThreadStore = create<ThreadStore>((set) => ({
  threads: [],
  loaded: false,
  setThreads: (threads) => set({ threads, loaded: true }),
}));

export function initThreadStore(): void {
  window.thread.invoke['threads:list'](undefined).then((threads) => {
    useThreadStore.getState().setThreads(threads);
  });
  window.thread.on('threads:changed', (threads) => useThreadStore.getState().setThreads(threads));
}
