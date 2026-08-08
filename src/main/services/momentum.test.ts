import { describe, expect, it } from 'vitest';
import { DMS_WEIGHTS } from '@shared/constants.js';
import { bandFor, dailyMomentumScore, dayMomentumSeries, weekScore } from './momentum.js';

const empty = { sessionsStarted: 0, focusMs: 0, stepsCompleted: 0, threadsCompleted: 0 };

describe('daily momentum score', () => {
  it('rewards starting: three sessions with nothing finished scores 35', () => {
    expect(dailyMomentumScore({ ...empty, sessionsStarted: 3 })).toBe(35);
  });

  it('caps each signal independently', () => {
    expect(dailyMomentumScore({ ...empty, sessionsStarted: 99 })).toBe(DMS_WEIGHTS.sessionStarted.cap);
    expect(dailyMomentumScore({ ...empty, focusMs: 99 * 60_000 })).toBe(DMS_WEIGHTS.focusMinute.cap);
    expect(dailyMomentumScore({ ...empty, stepsCompleted: 99 })).toBe(DMS_WEIGHTS.stepCompleted.cap);
    expect(dailyMomentumScore({ ...empty, threadsCompleted: 99 })).toBe(DMS_WEIGHTS.threadCompleted.cap);
  });

  it('never exceeds 100 or drops below 0', () => {
    const maxed = dailyMomentumScore({
      sessionsStarted: 50,
      focusMs: 50 * 3_600_000,
      stepsCompleted: 50,
      threadsCompleted: 50,
    });
    expect(maxed).toBe(100);
    expect(dailyMomentumScore(empty)).toBe(0);
  });

  it('has no term that can subtract — a distraction cannot lower the score', () => {
    const base = { sessionsStarted: 2, focusMs: 30 * 60_000, stepsCompleted: 1, threadsCompleted: 0 };
    // There is no distraction input at all; the type system is the guarantee.
    expect(dailyMomentumScore(base)).toBeGreaterThan(0);
    expect(Object.keys(DMS_WEIGHTS)).not.toContain('distraction');
  });
});

describe('rolling momentum', () => {
  it('dents rather than resets after a zero day', () => {
    const series = dayMomentumSeries([80, 80, 80, 80, 80, 0]);
    const last = series[series.length - 1]!;
    const previous = series[series.length - 2]!;
    expect(last).toBeLessThan(previous);
    expect(last).toBeGreaterThan(previous * 0.8);
  });

  it('never returns a negative value', () => {
    expect(dayMomentumSeries([0, 0, 0, 0]).every((value) => value >= 0)).toBe(true);
  });
});

describe('week score', () => {
  it('lifts a five-day week so weekends do not read as failure', () => {
    const fiveGoodDays = [70, 70, 70, 70, 70, 0, 0];
    expect(weekScore(fiveGoodDays)).toBe(70);
  });

  it('stays within 0..100', () => {
    expect(weekScore([100, 100, 100, 100, 100, 100, 100])).toBe(100);
    expect(weekScore([])).toBe(0);
  });
});

describe('bands', () => {
  it('names the low band Resting', () => {
    expect(bandFor(0).label).toBe('Resting');
    expect(bandFor(14).id).toBe('resting');
  });

  it('maps each documented range', () => {
    expect(bandFor(20).label).toBe('Warming up');
    expect(bandFor(50).label).toBe('Rolling');
    expect(bandFor(70).label).toBe('In flow');
    expect(bandFor(95).label).toBe('Lit');
  });
});
