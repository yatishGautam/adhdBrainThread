import { create } from 'zustand';
import type { AuthState } from '@shared/auth.js';
import { DEFAULT_SERVER_URL } from '@shared/auth.js';

/**
 * The account, mirrored from main. Nothing in the app reads this to decide whether a feature
 * works — signing in adds sync, it does not unlock anything (§ local-first). The only thing it
 * gates is the account panel's own contents.
 */
interface AuthStore extends AuthState {
  /** The last message from a failed sign-in, shown in the form and cleared on the next attempt. */
  error: string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  account: null,
  serverUrl: DEFAULT_SERVER_URL,
  offline: false,
  busy: false,
  error: null,
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen, error: null }),
  setError: (error) => set({ error }),
}));

function apply(state: AuthState): void {
  useAuthStore.setState(state);
}

export async function initAuthStore(): Promise<void> {
  apply(await window.thread.invoke['auth:state'](undefined));
  window.thread.on('auth:changed', apply);
}

/**
 * Runs an account action and leaves the store holding either the new state or a message.
 * Returns whether it worked, which is all the caller ever needs to know.
 */
export async function runAuth(action: () => Promise<AuthState>): Promise<boolean> {
  useAuthStore.setState({ error: null });
  try {
    apply(await action());
    return true;
  } catch (error: unknown) {
    useAuthStore.setState({ error: readableError(error), busy: false });
    return false;
  }
}

/**
 * Electron prefixes every rejected `invoke` with "Error invoking remote method 'x': Error: ".
 * The message underneath was already written for a person to read, so take the last part and
 * drop the plumbing.
 */
export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const parts = raw.split('Error: ');
  const message = (parts[parts.length - 1] ?? raw).trim();
  return message || 'Something went wrong. Try again.';
}
