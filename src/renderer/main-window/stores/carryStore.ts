import { create } from 'zustand';
import type { Blocker, Todo } from '@shared/domain.js';

/**
 * To-dos and blockers are global and carried forward (§5) — they belong to the app, not to a
 * day. They live on the day that raised them (which is where "since Aug 4" comes from), so this
 * store holds the flattened open set and refetches whenever any day writes one.
 */
interface CarryStore {
  todos: Todo[];
  blockers: Blocker[];
  loaded: boolean;
}

export const useCarryStore = create<CarryStore>(() => ({
  todos: [],
  blockers: [],
  loaded: false,
}));

export async function refreshCarry(): Promise<void> {
  const { todos, blockers } = await window.thread.invoke['carry:list'](undefined);
  useCarryStore.setState({ todos, blockers, loaded: true });
}

export async function initCarryStore(): Promise<void> {
  await refreshCarry();
  window.thread.on('carry:changed', () => void refreshCarry());
}
