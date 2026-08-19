/**
 * The week, as a timeline. The view the whole feature exists for.
 *
 * ## Two lanes, not one
 *
 * Each day is split: the plan on the left, what actually happened on the right. They are not
 * merged into one column, and that is the entire design.
 *
 * A single merged lane can only answer "what is on Tuesday". Two lanes answer the question you
 * actually have after generating a week, which is "did the week I designed survive contact with
 * the week I had" — and it answers it *shape-first*, before you read a single word. A day where
 * the right lane mirrors the left went to plan. A day with a full left lane and an empty right
 * one did not. A day with an empty left lane and a busy right one is work nobody planned, which
 * is usually the most informative square on the screen.
 *
 * ## Outlines and fills
 *
 * A plan is an outline — a shape you were going to fill. A session is solid, because it
 * happened. A planned block a session was matched to gets filled in. So a good week is a screen
 * of filled shapes and a scattered one is a screen of empty ones, legible from across the room,
 * which is the only way a calendar earns being left open beside your work.
 *
 * Nothing here draws an unmet block as a failure — no red, no strike-through. A plan is a
 * suggestion that was true when it was made, and a calendar that scolds you on a bad week is one
 * you stop opening on bad weeks, which are the weeks it would have been most useful.
 */
import type { Calendar, CalendarDay, CalendarEntry } from '@shared/calendar.js';
import { toMinutes } from '@shared/calendar.js';
import { entryColour, isActual, isFulfilled, KIND_LABEL, shortDuration } from './entryStyle.js';

export interface WeekGridProps {
  calendar: Calendar;
  today: string;
  /** Compact drops the hour gutter labels and the entry text, for the floating widget. */
  compact?: boolean;
  onPickDay?: (localDate: string) => void;
}

/** What an empty week draws — there is no content to size it to, so it shows a working day. */
const EMPTY_FROM = 8 * 60;
const EMPTY_TO = 18 * 60;
/** Below this the rows are too short to tell a 25-minute block from a 50-minute one. */
const MIN_SPAN_MINUTES = 6 * 60;

export function WeekGrid({
  calendar,
  today,
  compact = false,
  onPickDay,
}: WeekGridProps): React.JSX.Element {
  const window = timeWindow(calendar);
  const rowHeight = compact ? 12 : 15;
  const height = ((window.to - window.from) / 60) * rowHeight * 4;
  const gutter = compact ? 26 : 40;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', paddingLeft: gutter }}>
        {calendar.days.map((day) => (
          <DayHeader
            key={day.localDate}
            day={day}
            today={today}
            compact={compact}
            onPick={onPickDay}
          />
        ))}
      </div>

      <div style={{ display: 'flex', position: 'relative', minWidth: 0 }}>
        <HourGutter window={window} height={height} width={gutter} compact={compact} />

        <div style={{ display: 'flex', flex: 1, position: 'relative', minWidth: 0, height }}>
          <HourLines window={window} />
          {calendar.days.map((day) => (
            <DayColumn
              key={day.localDate}
              day={day}
              window={window}
              today={today}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The span of the day to draw: the content, and nothing else.
 *
 * Sized to what is actually on the week rather than to a fixed working day, in both directions.
 * Never *narrower* than the content, because a session at 23:40 that the grid silently cropped
 * would be a calendar that lies about a late night. But never wider either — a fixed 07:00–22:00
 * window spends a third of a floating widget's height on empty evening, which on the surface
 * whose whole justification is glanceability is the most expensive space there is.
 */
function timeWindow(calendar: Calendar): { from: number; to: number } {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (const day of calendar.days) {
    for (const entry of day.entries ?? []) {
      from = Math.min(from, toMinutes(entry.start));
      to = Math.max(to, toMinutes(entry.end), toMinutes(entry.start) + 15);
    }
    // The planned day counts even where it produced no blocks: "work from 09:00" is a fact about
    // the day, and a grid starting at the first block would hide an empty morning.
    if (day.plan) {
      from = Math.min(from, toMinutes(day.plan.startTime));
      to = Math.max(to, toMinutes(day.plan.endTime));
    }
  }

  if (!Number.isFinite(from) || !Number.isFinite(to)) return { from: EMPTY_FROM, to: EMPTY_TO };

  // Whole hours, with a little air at each end so nothing sits flush against the frame.
  let start = Math.max(0, Math.floor(from / 60) * 60 - 30);
  let end = Math.min(1440, Math.ceil(to / 60) * 60 + 30);
  // One 25-minute session on an otherwise blank week should not be drawn a screen tall.
  if (end - start < MIN_SPAN_MINUTES) {
    const pad = (MIN_SPAN_MINUTES - (end - start)) / 2;
    start = Math.max(0, start - pad);
    end = Math.min(1440, start + MIN_SPAN_MINUTES);
  }
  return { from: start, to: end };
}

function DayHeader({
  day,
  today,
  compact,
  onPick,
}: {
  day: CalendarDay;
  today: string;
  compact: boolean;
  onPick?: (localDate: string) => void;
}): React.JSX.Element {
  const isToday = day.localDate === today;
  const weekday = WEEKDAYS[dayIndex(day.localDate)];

  return (
    <button
      onClick={() => onPick?.(day.localDate)}
      disabled={!onPick}
      title={onPick ? `Open ${day.localDate}` : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        padding: compact ? '2px 2px 5px' : '4px 4px 8px',
        cursor: onPick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: compact ? 9 : 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: isToday ? 'var(--amber)' : 'var(--text-faint)',
        }}
      >
        {compact ? weekday?.slice(0, 1) : weekday}
      </div>
      <div
        style={{
          fontSize: compact ? 12 : 14,
          fontWeight: isToday ? 700 : 500,
          color: isToday ? 'var(--amber)' : 'var(--text-muted)',
          marginTop: 1,
        }}
      >
        {Number(day.localDate.slice(8, 10))}
      </div>
      {/*
        A day nobody planned says so, once, in the header. Repeating "no plan" down an empty
        column would turn the absence of a plan into the loudest thing on the screen.
      */}
      {!compact && !day.summary.planned && day.summary.sessions === 0 ? (
        <div style={{ fontSize: 9, color: 'var(--text-faint)', opacity: 0.6, marginTop: 1 }}>
          —
        </div>
      ) : null}
    </button>
  );
}

function HourGutter({
  window,
  height,
  width,
  compact,
}: {
  window: { from: number; to: number };
  height: number;
  width: number;
  compact: boolean;
}): React.JSX.Element {
  const hours = hourMarks(window);
  return (
    <div style={{ width, position: 'relative', height, flexShrink: 0 }}>
      {hours.map((minutes) => (
        <div
          key={minutes}
          style={{
            position: 'absolute',
            top: positionOf(minutes, window, height) - 6,
            right: 6,
            fontSize: compact ? 8.5 : 10,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {compact ? String(minutes / 60) : `${String(minutes / 60).padStart(2, '0')}:00`}
        </div>
      ))}
    </div>
  );
}

/** Faint rules behind everything, so a block's height reads as a duration rather than a size. */
function HourLines({ window }: { window: { from: number; to: number } }): React.JSX.Element {
  const hours = hourMarks(window);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {hours.map((minutes) => (
        <div
          key={minutes}
          style={{
            position: 'absolute',
            top: `${((minutes - window.from) / (window.to - window.from)) * 100}%`,
            left: 0,
            right: 0,
            borderTop: '1px solid var(--line)',
            opacity: 0.45,
          }}
        />
      ))}
    </div>
  );
}

function DayColumn({
  day,
  window,
  today,
  compact,
}: {
  day: CalendarDay;
  window: { from: number; to: number };
  today: string;
  compact: boolean;
}): React.JSX.Element {
  const entries = day.entries ?? [];
  const planned = entries.filter((entry) => !isActual(entry));
  const actual = entries.filter(isActual);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        borderRight: '1px solid var(--line)',
        background:
          day.localDate === today ? 'color-mix(in srgb, var(--amber) 4%, transparent)' : 'none',
      }}
    >
      {/* Left lane: the plan. Right lane: what happened. See the header. */}
      {planned.map((entry) => (
        <EntryBar
          key={entry.id}
          entry={entry}
          window={window}
          compact={compact}
          lane={{ left: '2%', width: '62%' }}
        />
      ))}
      {actual.map((entry) => (
        <EntryBar
          key={entry.id}
          entry={entry}
          window={window}
          compact={compact}
          lane={{ left: '66%', width: '32%' }}
        />
      ))}
    </div>
  );
}

function EntryBar({
  entry,
  window,
  compact,
  lane,
}: {
  entry: CalendarEntry;
  window: { from: number; to: number };
  compact: boolean;
  lane: { left: string; width: string };
}): React.JSX.Element {
  const start = toMinutes(entry.start);
  const end = Math.max(toMinutes(entry.end), start + MIN_VISIBLE_MINUTES);
  const colour = entryColour(entry);
  const solid = isActual(entry) || isFulfilled(entry);

  const top = ((start - window.from) / (window.to - window.from)) * 100;
  const height = ((end - start) / (window.to - window.from)) * 100;

  return (
    <div
      title={tooltip(entry)}
      style={{
        position: 'absolute',
        top: `${top}%`,
        height: `${height}%`,
        left: lane.left,
        width: lane.width,
        borderRadius: 4,
        // Solid for what happened, an outline for what was merely intended.
        background: solid
          ? `color-mix(in srgb, ${colour} 78%, transparent)`
          : `color-mix(in srgb, ${colour} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colour} ${solid ? 90 : 45}%, transparent)`,
        // The running session is the one thing on the grid allowed to move.
        animation: entry.status === 'running' ? 'calendarPulse 2s ease-in-out infinite' : undefined,
        overflow: 'hidden',
        padding: compact ? '1px 3px' : '2px 5px',
        boxSizing: 'border-box',
      }}
    >
      {compact ? null : (
        <div
          style={{
            fontSize: 9.5,
            lineHeight: 1.25,
            color: solid ? 'var(--ink)' : 'var(--text-muted)',
            fontWeight: solid ? 600 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.title}
        </div>
      )}
    </div>
  );
}

/** A block shorter than this is a sliver nobody can hover. Twelve minutes is about 2px. */
const MIN_VISIBLE_MINUTES = 12;

function tooltip(entry: CalendarEntry): string {
  const spent = shortDuration(entry.actualMs);
  const kind = KIND_LABEL[entry.kind] ?? entry.kind;
  const head = `${entry.start}–${entry.end}  ${entry.title}  · ${kind}`;
  const tail =
    entry.source === 'plan'
      ? entry.status === 'done'
        ? `\nDone — ${spent} logged against it.`
        : '\nPlanned. Nothing logged against it yet.'
      : spent
        ? `\n${spent}`
        : '';
  return `${head}${tail}${entry.why ? `\n\n${entry.why}` : ''}`;
}

function hourMarks({ from, to }: { from: number; to: number }): number[] {
  const marks: number[] = [];
  // Every hour is too many lines under about 12px an hour, so thin to every second hour.
  const step = to - from > 14 * 60 ? 120 : 60;
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) marks.push(m);
  return marks;
}

function positionOf(
  minutes: number,
  window: { from: number; to: number },
  height: number,
): number {
  return ((minutes - window.from) / (window.to - window.from)) * height;
}

/** Monday-first, matching the ISO weeks the whole app files things under. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** 0 = Monday. Pure UTC arithmetic on a local date string, like everything else in the app. */
function dayIndex(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
