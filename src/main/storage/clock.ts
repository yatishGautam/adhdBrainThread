import { localDateOf, nowIso, systemTimezone } from '@shared/time.js';

/**
 * Injectable so tests can freeze time and so every `localDate` in the app comes from one place.
 * Session *durations* deliberately do not use this — they use a monotonic clock, because the
 * wall clock can move backwards (§4.6 #14).
 */
export interface Clock {
  now(): string;
  timezone(): string;
  today(): string;
  localDateOf(instant: string): string;
}

export function systemClock(timezone: () => string = systemTimezone): Clock {
  return {
    now: nowIso,
    timezone,
    today: () => localDateOf(new Date(), timezone()),
    localDateOf: (instant) => localDateOf(instant, timezone()),
  };
}
