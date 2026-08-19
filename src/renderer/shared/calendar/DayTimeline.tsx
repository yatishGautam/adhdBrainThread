/**
 * One day, as a list rather than a grid.
 *
 * The week view is a grid because the question there is shape — did the week hold together. The
 * question about a single day is different and much more concrete: what am I meant to be doing,
 * and did the last thing happen. A list answers that at a glance and has room for the block's
 * `why`, which is the line that makes a plan arguable instead of obeyed, and which no grid cell
 * is ever wide enough to show.
 *
 * Plan and reality are interleaved in time order rather than split into lanes, because within one
 * day the sequence *is* the story — a session sitting directly under the block it fulfilled reads
 * as cause and effect.
 */
import type { CalendarDay, CalendarEntry } from '@shared/calendar.js';
import { entryColour, isActual, isFulfilled, KIND_LABEL, shortDuration } from './entryStyle.js';

export interface DayTimelineProps {
  day: CalendarDay;
  compact?: boolean;
  /** Rendered at the right of a plan row — the Start button on the full page. */
  action?: (entry: CalendarEntry) => React.ReactNode;
}

export function DayTimeline({ day, compact = false, action }: DayTimelineProps): React.JSX.Element {
  const entries = day.entries ?? [];

  if (!entries.length) {
    return (
      <div
        style={{
          padding: compact ? '14px 8px' : '22px 8px',
          fontSize: compact ? 11.5 : 13,
          color: 'var(--text-faint)',
          textAlign: 'center',
        }}
      >
        {day.summary.planned
          ? 'This day was planned, and the plan is empty.'
          : 'Nothing planned, nothing logged.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {day.plan?.headline && !compact ? (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text)',
            margin: '0 0 14px',
          }}
        >
          {day.plan.headline}
        </p>
      ) : null}

      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} compact={compact} action={action} />
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  compact,
  action,
}: {
  entry: CalendarEntry;
  compact: boolean;
  action?: (entry: CalendarEntry) => React.ReactNode;
}): React.JSX.Element {
  const colour = entryColour(entry);
  const actual = isActual(entry);
  const spent = shortDuration(entry.actualMs);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: compact ? 8 : 12,
        padding: compact ? '3px 4px' : '7px 8px',
        borderRadius: 8,
        // What happened is indented under the plan, so a session reads as an answer to the block
        // above it rather than as another thing on the list.
        marginLeft: actual ? (compact ? 10 : 18) : 0,
      }}
    >
      <span
        style={{
          fontSize: compact ? 10 : 11.5,
          color: 'var(--text-faint)',
          flexShrink: 0,
          width: compact ? 62 : 88,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/*
          Compact shows the start only. `09:00–10:00` does not fit the narrow column and wraps to
          two lines, which turns a scannable list into a ragged one — and in a glance list the
          question is when a thing starts, not how long it was booked for.
        */}
        {compact || entry.end === entry.start ? entry.start : `${entry.start}–${entry.end}`}
      </span>

      <span
        title={KIND_LABEL[entry.kind]}
        style={{
          width: compact ? 5 : 6,
          height: compact ? 5 : 6,
          borderRadius: '50%',
          // Hollow for a plan, solid for reality — the same language the week grid uses.
          background: actual || isFulfilled(entry) ? colour : 'transparent',
          border: `1.5px solid ${colour}`,
          flexShrink: 0,
          alignSelf: 'center',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 11.5 : 13,
            color: actual ? 'var(--text-muted)' : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: compact ? 'nowrap' : 'normal',
          }}
        >
          {entry.title}
          {entry.status === 'running' ? (
            <span style={{ color: 'var(--amber)', fontSize: compact ? 10 : 11 }}> · running</span>
          ) : null}
        </div>
        {entry.why && !compact ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>
            {entry.why}
          </div>
        ) : null}
      </div>

      {spent ? (
        <span
          style={{
            fontSize: compact ? 10 : 11,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          {spent}
        </span>
      ) : null}

      {action && !actual ? action(entry) : null}
    </div>
  );
}
