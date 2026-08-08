import { create } from 'zustand';
import type { RecoveryOffer, SessionState } from '@shared/ipc/channels.js';

interface SessionStore {
  state: SessionState | null;
  recovery: RecoveryOffer | null;
  setState: (state: SessionState | null) => void;
  setRecovery: (offer: RecoveryOffer | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  state: null,
  recovery: null,
  setState: (state) => set({ state }),
  setRecovery: (offer) => set({ recovery: offer }),
}));

export async function initSessionStore(): Promise<void> {
  const state = await window.thread.invoke['session:state'](undefined);
  useSessionStore.getState().setState(state);
  window.thread.on('session:changed', (state) => useSessionStore.getState().setState(state));
  window.thread.on('session:recovery', (offer) => useSessionStore.getState().setRecovery(offer));
}
