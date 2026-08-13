import type { Thread } from '@shared/domain.js';
import { boardOrder } from './threads/ThreadsView.js';

/**
 * The zero-decision start. Starting is the hard part, and choosing is the last decision left
 * standing in the way — so this removes it: the top thread on the board is, by construction,
 * the one you put there. No picker, no thinking, one press.
 */
export function pickJustStart(threads: Thread[]): Thread | null {
  const board = boardOrder(
    threads.filter((t) => t.status !== 'done' && t.status !== 'dormant'),
  );
  // Prefer something already moving; a blocked thread at the top shouldn't hijack the button.
  return board.find((t) => t.status === 'in_progress' || t.status === 'idle') ?? board[0] ?? null;
}

export async function justStart(threads: Thread[]): Promise<boolean> {
  const pick = pickJustStart(threads);
  if (!pick) return false;
  await window.thread.invoke['session:start']({ threadId: pick.id });
  return true;
}
