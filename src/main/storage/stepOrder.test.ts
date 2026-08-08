import { describe, expect, it } from 'vitest';
import type { Step } from '@shared/domain.js';
import { nextAction, nextOrder, orderAfter, renumber, reorder, sortByOrder } from './stepOrder.js';

function step(id: string, order: number, done = false): Step {
  return { id, text: id, done, order };
}

describe('sparse ordering', () => {
  it('appends at the next multiple', () => {
    expect(nextOrder([step('a', 1000), step('b', 2000)])).toBe(3000);
    expect(nextOrder([])).toBe(1000);
  });

  it('inserts at the midpoint of two neighbours without touching them', () => {
    const steps = [step('a', 1000), step('b', 2000)];
    expect(orderAfter(steps, 'a')).toBe(1500);
    expect(steps.map((s) => s.order)).toEqual([1000, 2000]);
  });

  it('moves one item and leaves every other order untouched', () => {
    const steps = [step('a', 1000), step('b', 2000), step('c', 3000)];
    const { items, renumbered } = reorder(steps, 'c', 0);
    expect(renumbered).toBe(false);
    expect(items.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(items.find((s) => s.id === 'a')?.order).toBe(1000);
    expect(items.find((s) => s.id === 'b')?.order).toBe(2000);
  });

  it('renumbers the whole list only once a gap closes below 1', () => {
    const tight = [step('a', 1000), step('b', 1001), step('c', 3000)];
    const { items, renumbered } = reorder(tight, 'c', 1);
    expect(renumbered).toBe(true);
    expect(items.map((s) => s.order)).toEqual([1000, 2000, 3000]);
    expect(items.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('is stable under repeated renumbering', () => {
    const once = renumber([step('a', 5), step('b', 3)]);
    expect(renumber(once)).toEqual(once);
  });

  it('sorts by order, not by insertion', () => {
    expect(sortByOrder([step('b', 2000), step('a', 1000)]).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('next action', () => {
  it('is the top unchecked step', () => {
    const steps = [step('a', 1000, true), step('b', 2000), step('c', 3000)];
    expect(nextAction(steps)?.id).toBe('b');
  });

  it('is null when everything is checked', () => {
    expect(nextAction([step('a', 1000, true)])).toBeNull();
  });
});
