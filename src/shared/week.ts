/**
 * ISO week keys — `2026-W34` — the primary key a weekly goal is filed under.
 *
 * ISO rather than "whatever week the 1st falls in", for one reason that matters here: an ISO
 * week always has exactly seven days and always starts on Monday, so a goal never belongs to
 * two weeks and no week is ever three days long. The awkward consequence is that early January
 * can belong to the *previous* year's week 52 or 53, which is why the year in the key is the
 * ISO week-numbering year and not `localDate.slice(0, 4)` — those disagree about five days a
 * year, and the disagreement is silent.
 *
 * Everything here is pure string/UTC arithmetic on `YYYY-MM-DD`, like `time.ts`: the local date
 * has already had the timezone applied by the time it gets here, so applying one again is how
 * a Monday turns into the previous Sunday.
 */
import { addLocalDays, startOfLocalWeek } from './time.js';

/** `2026-W34`. Sorts lexically within a year, which is all the ordering this app needs. */
export type WeekKey = string;

const WEEK_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;

/**
 * The ISO week-numbering year and week for a local date.
 *
 * The trick is the Thursday: ISO defines a week's year as the year containing that week's
 * Thursday, so shifting to Thursday first makes the year fall out of `getUTCFullYear()` with no
 * special cases for the January/December boundary.
 */
export function weekKeyOf(localDate: string): WeekKey {
  const monday = startOfLocalWeek(localDate);
  const thursday = addLocalDays(monday, 3);
  const [y, m, d] = thursday.split('-').map(Number) as [number, number, number];
  const thursdayUtc = new Date(Date.UTC(y, m - 1, d));
  const year = thursdayUtc.getUTCFullYear();

  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursdayUtc.getTime() - jan1) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Monday a week key starts on, as a local date. Inverse of `weekKeyOf`. */
export function weekStart(key: WeekKey): string {
  const match = WEEK_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`not a week key: ${key}`);
  const year = Number(match[1]);
  const week = Number(match[2]);

  // Jan 4th is always in ISO week 1, by definition — the cheapest anchor there is.
  const jan4 = `${year}-01-04`;
  return addLocalDays(startOfLocalWeek(jan4), (week - 1) * 7);
}

/** The Sunday a week key ends on. */
export function weekEnd(key: WeekKey): string {
  return addLocalDays(weekStart(key), 6);
}

/** Every local date in the week, Monday first. */
export function weekDates(key: WeekKey): string[] {
  const monday = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addLocalDays(monday, i));
}

/**
 * The days of this week that have not happened yet, today included.
 *
 * The whole question the planner is built around: pressing the button on Thursday must plan
 * Thursday to Sunday, not replay Monday. The server does this arithmetic too, from the local
 * date this app sends it — the copy here is what the button counts to label itself.
 */
export function remainingWeekDates(localDate: string): string[] {
  return weekDates(weekKeyOf(localDate)).filter((date) => date >= localDate);
}

/** `offset: -1` is last week. Goes through dates rather than the number, so week 1 wraps. */
export function shiftWeek(key: WeekKey, offset: number): WeekKey {
  return weekKeyOf(addLocalDays(weekStart(key), offset * 7));
}

export function isWeekKey(value: string): boolean {
  return WEEK_KEY_PATTERN.test(value);
}

/** `Aug 17 – 23` — the label above the goal list. The year is only worth saying when it turns. */
export function formatWeekRange(key: WeekKey): string {
  const start = weekStart(key);
  const end = weekEnd(key);
  const month = (date: string): string => MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
  const day = (date: string): number => Number(date.slice(8, 10));

  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${month(start)} ${day(start)} – ${day(end)}`;
  }
  return `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
}

/** "This week" / "Last week" / "In 3 weeks" — relative beats a bare number for the current one. */
export function formatWeekRelative(key: WeekKey, todayDate: string): string {
  const current = weekKeyOf(todayDate);
  if (key === current) return 'This week';
  if (key === shiftWeek(current, -1)) return 'Last week';
  if (key === shiftWeek(current, 1)) return 'Next week';

  const weeks = Math.round(
    (Date.parse(`${weekStart(key)}T00:00:00Z`) - Date.parse(`${weekStart(current)}T00:00:00Z`)) /
      (7 * 86_400_000),
  );
  return weeks < 0 ? `${-weeks} weeks ago` : `In ${weeks} weeks`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
