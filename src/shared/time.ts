/**
 * Local-day helpers. `localDate` is always computed here, at write time, from an explicit
 * timezone — never re-derived from a UTC timestamp at read time (§4.6 #11).
 */
import { format, toZonedTime } from 'date-fns-tz';

export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function localDateOf(instant: Date | string, timezone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return format(toZonedTime(date, timezone), 'yyyy-MM-dd', { timeZone: timezone });
}

export function localHourOf(instant: Date | string, timezone: string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return toZonedTime(date, timezone).getHours();
}

export function todayLocalDate(timezone: string): string {
  return localDateOf(new Date(), timezone);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Arithmetic on a YYYY-MM-DD string, timezone-free by construction. */
export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function localDateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addLocalDays(cursor, 1)) out.push(cursor);
  return out;
}

export function diffLocalDays(from: string, to: string): number {
  const parse = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** ISO week start (Monday) for a local date, as a local date string. */
export function startOfLocalWeek(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  const shift = (utc.getUTCDay() + 6) % 7;
  return addLocalDays(localDate, -shift);
}

export function startOfLocalMonth(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

export function endOfLocalMonth(localDate: string): string {
  const [y, m] = localDate.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${localDate.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}
