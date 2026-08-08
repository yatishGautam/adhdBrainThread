/**
 * Sparse integer ordering (1000, 2000, 3000). A reorder writes one step's `order` to the
 * midpoint of its neighbours; only when a gap closes below 1 does the whole list renumber.
 * Array-index ordering would rewrite every step on every drag and lose concurrent edits.
 */
import { ORDER_MIN_GAP, ORDER_STEP } from '@shared/constants.js';
import type { Step } from '@shared/domain.js';

export function sortSteps(steps: Step[]): Step[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

export function nextOrder(steps: Step[]): number {
  const highest = steps.reduce((max, step) => Math.max(max, step.order), 0);
  return highest + ORDER_STEP;
}

/** Order value that places a new step directly after `afterStepId`. */
export function orderAfter(steps: Step[], afterStepId: string): number {
  const sorted = sortSteps(steps);
  const index = sorted.findIndex((step) => step.id === afterStepId);
  if (index === -1) return nextOrder(steps);
  const before = sorted[index];
  const after = sorted[index + 1];
  if (!before) return nextOrder(steps);
  if (!after) return before.order + ORDER_STEP;
  return midpoint(before.order, after.order);
}

export function midpoint(low: number, high: number): number {
  return low + (high - low) / 2;
}

export interface ReorderResult {
  steps: Step[];
  /** True when the gap collapsed and the whole list was renumbered. */
  renumbered: boolean;
}

/** Moves `stepId` to `toIndex` in the visible (sorted) order. */
export function reorderStep(steps: Step[], stepId: string, toIndex: number): ReorderResult {
  const sorted = sortSteps(steps);
  const moving = sorted.find((step) => step.id === stepId);
  if (!moving) return { steps, renumbered: false };

  const without = sorted.filter((step) => step.id !== stepId);
  const target = Math.max(0, Math.min(toIndex, without.length));
  const before = without[target - 1];
  const after = without[target];

  const order =
    !before && !after
      ? ORDER_STEP
      : !before
        ? (after as Step).order - ORDER_STEP
        : !after
          ? before.order + ORDER_STEP
          : midpoint(before.order, after.order);

  const moved: Step = { ...moving, order };
  const next = sortSteps([...without, moved]);

  if (needsRenumber(next)) return { steps: renumber(next), renumbered: true };
  return { steps: next, renumbered: false };
}

function needsRenumber(steps: Step[]): boolean {
  for (let i = 1; i < steps.length; i += 1) {
    const previous = steps[i - 1];
    const current = steps[i];
    if (previous && current && current.order - previous.order < ORDER_MIN_GAP) return true;
  }
  return false;
}

export function renumber(steps: Step[]): Step[] {
  return sortSteps(steps).map((step, index) => ({ ...step, order: (index + 1) * ORDER_STEP }));
}

/** The top unchecked step — what turns the board from an inventory into a menu. */
export function nextAction(steps: Step[]): Step | null {
  return sortSteps(steps).find((step) => !step.done) ?? null;
}
