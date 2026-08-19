/**
 * How a calendar entry looks, in one place.
 *
 * The colours are the app's existing status palette rather than a new one: amber is focus
 * everywhere else in this app, and a calendar that invented its own vocabulary would be a second
 * thing to learn. `PlanSection` on the daily page imports these too, so the block you read in
 * the day and the block you read on the calendar cannot drift apart.
 */
import type { CalendarEntry, CalendarKind } from '@shared/calendar.js';

export const KIND_COLOUR: Record<CalendarKind, string> = {
  focus: 'var(--amber)',
  break: 'var(--emerald)',
  admin: 'var(--slate)',
  meal: 'var(--lavender)',
  buffer: 'var(--line-strong)',
  wind_down: 'var(--lavender)',
  // What actually happened, in the colours those things already have elsewhere in the app.
  session: 'var(--amber-bright)',
  sit: 'var(--moss)',
};

export const KIND_LABEL: Record<CalendarKind, string> = {
  focus: 'Focus',
  break: 'Break',
  admin: 'Admin',
  meal: 'Meal',
  buffer: 'Slack',
  wind_down: 'Wind down',
  session: 'Focused',
  sit: 'Sat',
};

/**
 * Whether an entry is drawn as a solid bar or an outline.
 *
 * The distinction the eye needs first is *plan versus reality*, not which kind of block it was.
 * A plan is an outline — a shape you were going to fill. A session is solid, because it happened.
 * That way a week where the outlines are empty looks obviously different from one where they are
 * filled, at a glance and from across the room, which is the only way a widget earns its space.
 */
export function isActual(entry: CalendarEntry): boolean {
  return entry.source !== 'plan';
}

/** A planned block that a session was matched to. Drawn filled-in, like the reality it met. */
export function isFulfilled(entry: CalendarEntry): boolean {
  return entry.source === 'plan' && entry.status === 'done';
}

/**
 * The colour a plan block should be drawn in.
 *
 * A block nothing was logged against stays its own colour at reduced strength rather than
 * turning red or grey. Nothing here scolds: a plan is a suggestion that was true when it was
 * made, and a calendar that marks unmet blocks as failures is one you stop opening on a bad week.
 */
export function entryColour(entry: CalendarEntry): string {
  return KIND_COLOUR[entry.kind] ?? 'var(--line-strong)';
}

/** `1h 25m`, `25m`, `—`. Short enough to sit inside a block on a week column. */
export function shortDuration(ms: number | undefined): string {
  if (!ms || ms < 60_000) return '';
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${minutes}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
