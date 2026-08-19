import { describe, expect, it } from 'vitest';
import {
  formatWeekRange,
  formatWeekRelative,
  shiftWeek,
  weekDates,
  weekEnd,
  weekKeyOf,
  weekStart,
} from './week.js';

describe('weekKeyOf', () => {
  it('gives every day of one week the same key', () => {
    // Mon 2026-08-17 through Sun 2026-08-23.
    const keys = weekDates('2026-W34').map(weekKeyOf);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('2026-W34');
  });

  it('rolls over on Monday, not Sunday', () => {
    expect(weekKeyOf('2026-08-23')).toBe('2026-W34'); // Sunday — still last week
    expect(weekKeyOf('2026-08-24')).toBe('2026-W35'); // Monday — new week
  });

  /**
   * The whole reason the key carries an ISO week-numbering year: these dates are in 2027 by
   * the calendar but belong to 2026's last week, and filing them under 2027-W01 would split
   * one week of goals across two years.
   */
  it('files early January under the previous year when the week started there', () => {
    expect(weekKeyOf('2026-12-31')).toBe('2026-W53');
    expect(weekKeyOf('2027-01-01')).toBe('2026-W53');
    expect(weekKeyOf('2027-01-03')).toBe('2026-W53');
    expect(weekKeyOf('2027-01-04')).toBe('2027-W01');
  });

  it('files late December under the next year when the week runs into it', () => {
    // 2024-12-30 is a Monday whose Thursday lands in 2025.
    expect(weekKeyOf('2024-12-30')).toBe('2025-W01');
  });

  it('handles a 53-week year', () => {
    expect(weekKeyOf('2026-12-28')).toBe('2026-W53');
  });
});

describe('weekStart / weekEnd', () => {
  it('inverts weekKeyOf', () => {
    for (const date of ['2026-08-19', '2027-01-01', '2024-12-30', '2026-03-01']) {
      const key = weekKeyOf(date);
      expect(weekKeyOf(weekStart(key))).toBe(key);
      expect(weekKeyOf(weekEnd(key))).toBe(key);
    }
  });

  it('starts on Monday and ends on Sunday', () => {
    expect(weekStart('2026-W34')).toBe('2026-08-17');
    expect(weekEnd('2026-W34')).toBe('2026-08-23');
  });

  it('spans exactly seven days', () => {
    expect(weekDates('2026-W53')).toHaveLength(7);
  });

  it('rejects a malformed key rather than guessing', () => {
    expect(() => weekStart('2026-34')).toThrow();
    expect(() => weekStart('')).toThrow();
  });
});

describe('shiftWeek', () => {
  it('walks backwards across a year boundary', () => {
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
  });

  it('is its own inverse', () => {
    expect(shiftWeek(shiftWeek('2026-W34', -5), 5)).toBe('2026-W34');
  });
});

describe('formatWeekRange', () => {
  it('says the month once when the week does not cross one', () => {
    expect(formatWeekRange('2026-W34')).toBe('Aug 17 – 23');
  });

  it('says both months when it does', () => {
    // 2026-W40 runs Sep 28 – Oct 4.
    expect(formatWeekRange('2026-W40')).toBe('Sep 28 – Oct 4');
  });
});

describe('formatWeekRelative', () => {
  it('names the weeks either side of today', () => {
    const today = '2026-08-19';
    expect(formatWeekRelative('2026-W34', today)).toBe('This week');
    expect(formatWeekRelative('2026-W33', today)).toBe('Last week');
    expect(formatWeekRelative('2026-W35', today)).toBe('Next week');
  });

  it('counts further out in both directions', () => {
    const today = '2026-08-19';
    expect(formatWeekRelative('2026-W31', today)).toBe('3 weeks ago');
    expect(formatWeekRelative('2026-W37', today)).toBe('In 3 weeks');
  });
});
