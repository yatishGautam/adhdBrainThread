import { describe, expect, it } from 'vitest';
import { formatTrayCountdown } from './format.js';

/**
 * The menu bar is shared, fixed-width space — on a notched Mac, a crowded one. What goes up
 * there has to be short, and it has to change as rarely as it can get away with.
 */
describe('the menu bar countdown', () => {
  it('is minutes, so it changes once a minute rather than once a second', () => {
    // Every second of one minute produces the same string, so the menu bar is written once
    // rather than sixty times. Rounding up, that minute is the half-open range (21m, 22m].
    const oneMinute = Array.from({ length: 60 }, (_unused, second) => 21 * 60_000 + second * 1_000 + 1);
    expect(new Set(oneMinute.map(formatTrayCountdown))).toEqual(new Set(['22m']));

    // …and the second it crosses into the next one, it changes exactly once.
    expect(formatTrayCountdown(21 * 60_000)).toBe('21m');
  });

  it('never says 0m while there is still time on the clock', () => {
    // Rounded up: "0m" on a running timer reads as finished, and it isn't.
    expect(formatTrayCountdown(30_000)).toBe('1m');
    expect(formatTrayCountdown(1)).toBe('1m');
    expect(formatTrayCountdown(0)).toBe('0m');
  });

  it('stays narrow — a 25 minute block is three characters, not eight', () => {
    expect(formatTrayCountdown(25 * 60_000)).toBe('25m');
    expect(formatTrayCountdown(25 * 60_000).length).toBeLessThan('● 25:00'.length);
  });

  it('does not go negative when a session overruns', () => {
    expect(formatTrayCountdown(-5_000)).toBe('0m');
  });
});
