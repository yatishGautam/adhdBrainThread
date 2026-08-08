/**
 * Sparse integer ordering (1000, 2000, 3000). A reorder writes one item's `order` to the
 * midpoint of its neighbours; only when a gap closes below 1 does the whole list renumber.
 * Array-index ordering would rewrite every item on every drag and lose concurrent edits.
 *
 * Generic because todos reorder the same way steps do.
 */
import { ORDER_MIN_GAP, ORDER_STEP } from '@shared/constants.js';
import type { Step } from '@shared/domain.js';

export interface Orderable {
  id: string;
  order: number;
}

export function sortByOrder<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function nextOrder(items: Orderable[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), 0) + ORDER_STEP;
}

/** Order value that places a new item directly after `afterId`. */
export function orderAfter<T extends Orderable>(items: T[], afterId: string): number {
  const sorted = sortByOrder(items);
  const index = sorted.findIndex((item) => item.id === afterId);
  const before = index === -1 ? undefined : sorted[index];
  if (!before) return nextOrder(items);
  const after = sorted[index + 1];
  return after ? midpoint(before.order, after.order) : before.order + ORDER_STEP;
}

export function midpoint(low: number, high: number): number {
  return low + (high - low) / 2;
}

export interface ReorderResult<T> {
  items: T[];
  /** True when the gap collapsed and the whole list was renumbered. */
  renumbered: boolean;
}

/** Moves `id` to `toIndex` in the visible (sorted) order. */
export function reorder<T extends Orderable>(
  items: T[],
  id: string,
  toIndex: number,
): ReorderResult<T> {
  const sorted = sortByOrder(items);
  const moving = sorted.find((item) => item.id === id);
  if (!moving) return { items: sorted, renumbered: false };

  const without = sorted.filter((item) => item.id !== id);
  const target = Math.max(0, Math.min(toIndex, without.length));
  const before = without[target - 1];
  const after = without[target];

  let order: number;
  if (!before && !after) order = ORDER_STEP;
  else if (!before) order = (after as T).order - ORDER_STEP;
  else if (!after) order = before.order + ORDER_STEP;
  else order = midpoint(before.order, after.order);

  const next = sortByOrder([...without, { ...moving, order }]);
  return needsRenumber(next)
    ? { items: renumber(next), renumbered: true }
    : { items: next, renumbered: false };
}

function needsRenumber(items: Orderable[]): boolean {
  for (let i = 1; i < items.length; i += 1) {
    const previous = items[i - 1];
    const current = items[i];
    if (previous && current && current.order - previous.order < ORDER_MIN_GAP) return true;
  }
  return false;
}

export function renumber<T extends Orderable>(items: T[]): T[] {
  return sortByOrder(items).map((item, index) => ({ ...item, order: (index + 1) * ORDER_STEP }));
}

/** The top unchecked step — what turns the board from an inventory into a menu. */
export function nextAction(steps: Step[]): Step | null {
  return sortByOrder(steps).find((step) => !step.done) ?? null;
}
