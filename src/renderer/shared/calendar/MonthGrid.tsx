/**
 * The month, as squares.
 *
 * A month of block lists is unreadable and nobody reads it, so this renders the one thing a month
 * is genuinely good at: pattern. Each square carries two bars — what was planned and what
 * happened — and the month tells you where the good weeks were without you reading a word of it.
 *
 * This is why the API has `detail=summary`. A month at full detail would ship five hundred blocks
 * so that a client could count them and then draw two bars.
 *
 * Days outside the anchored month are drawn, greyed. Dropping them would leave ragged edges, and
 * showing them blank would suggest nothing happened on days that simply belong to April.
 */
import type { Calendar, CalendarDay } from '@shared/calendar.js';
import { shortDuration } from './entryStyle.js';

export interface MonthGridProps {
  calendar: Calendar;
  today: string;
  /** `YYYY-MM` — days outside it are drawn dimmed as the grid's leading and trailing edges. */
  month: string;
  compact?: boolean;
  onPickDay?: (localDate: string) => void;
}

export function MonthGrid({
  calendar,
  today,
  month,
  compact = false,
  onPickDay,
}: MonthGridProps): React.JSX.Element {
  // The busiest day sets the scale, so the bars are comparable within the month rather than
  // against an absolute nobody has a feel for. A quiet month is not drawn as a failed one.
  const peak = Math.max(
    ...calendar.days.map((day) => Math.max(day.summary.plannedMs, day.summary.focusMs)),
    1,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: compact ? 2 : 4 }}>
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            style={{
              fontSize: compact ? 8.5 : 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-faint)',
              textAlign: 'center',
              paddingBottom: 2,
            }}
          >
            {compact ? weekday.slice(0, 1) : weekday}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: compact ? 2 : 4 }}>
        {calendar.days.map((day) => (
          <MonthCell
            key={day.localDate}
            day={day}
            today={today}
            inMonth={day.localDate.slice(0, 7) === month}
            peak={peak}
            compact={compact}
            onPick={onPickDay}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  today,
  inMonth,
  peak,
  compact,
  onPick,
}: {
  day: CalendarDay;
  today: string;
  inMonth: boolean;
  peak: number;
  compact: boolean;
  onPick?: (localDate: string) => void;
}): React.JSX.Element {
  const isToday = day.localDate === today;
  const { plannedMs, focusMs } = day.summary;

  return (
    <button
      onClick={() => onPick?.(day.localDate)}
      disabled={!onPick}
      title={cellTooltip(day)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        aspectRatio: compact ? '1 / 0.8' : '1 / 0.85',
        padding: compact ? 3 : 6,
        borderRadius: compact ? 5 : 8,
        border: `1px solid ${isToday ? 'var(--amber)' : 'var(--line)'}`,
        background: isToday
          ? 'color-mix(in srgb, var(--amber) 8%, transparent)'
          : 'var(--surface)',
        // Outside the anchored month, but still real days with real records on them.
        opacity: inMonth ? 1 : 0.38,
        cursor: onPick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        textAlign: 'left',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: compact ? 9.5 : 11.5,
          fontWeight: isToday ? 700 : 500,
          color: isToday ? 'var(--amber)' : 'var(--text-muted)',
          lineHeight: 1,
        }}
      >
        {Number(day.localDate.slice(8, 10))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' }}>
        {/* Planned above, actual below. Same order as the week grid's lanes, left to right. */}
        <Bar ms={plannedMs} peak={peak} colour="var(--slate)" solid compact={compact} />
        <Bar ms={focusMs} peak={peak} colour="var(--amber)" solid compact={compact} />
      </div>
    </button>
  );
}

/**
 * One bar. Zero draws a hairline rather than nothing, so an empty day is visibly an empty day
 * rather than a rendering failure — and so the two rows stay aligned down the whole month.
 */
function Bar({
  ms,
  peak,
  colour,
  solid,
  compact,
}: {
  ms: number;
  peak: number;
  colour: string;
  solid: boolean;
  compact: boolean;
}): React.JSX.Element {
  const fraction = Math.min(1, ms / peak);
  return (
    <div
      style={{
        height: compact ? 3 : 4,
        borderRadius: 2,
        background: 'var(--line)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(fraction * 100, ms > 0 ? 8 : 0)}%`,
          height: '100%',
          background: solid ? colour : `color-mix(in srgb, ${colour} 55%, transparent)`,
        }}
      />
    </div>
  );
}

function cellTooltip(day: CalendarDay): string {
  const { plannedMs, focusMs, blocks, blocksDone, sessions, todosOpen } = day.summary;
  if (!day.summary.planned && !sessions) return `${day.localDate}\nNothing planned, nothing logged.`;
  const lines = [day.localDate];
  if (day.summary.planned) {
    lines.push(`Planned: ${shortDuration(plannedMs) || 'no work blocks'} across ${blocks} blocks`);
    lines.push(`Followed: ${blocksDone}/${blocks} blocks`);
  } else {
    lines.push('No plan for this day.');
  }
  if (sessions) lines.push(`Focused: ${shortDuration(focusMs)} over ${sessions} sessions`);
  if (todosOpen) lines.push(`${todosOpen} to-do${todosOpen === 1 ? '' : 's'} still open`);
  return lines.join('\n');
}

/** Monday-first, matching the ISO weeks the whole app files things under. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
