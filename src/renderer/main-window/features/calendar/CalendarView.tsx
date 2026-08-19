import type { CalendarEntry, CalendarScope } from '@shared/calendar.js';
import { formatWeekRange, weekKeyOf } from '@shared/week.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';
import { DayTimeline } from '../../../shared/calendar/DayTimeline.js';
import { MonthGrid } from '../../../shared/calendar/MonthGrid.js';
import { WeekGrid } from '../../../shared/calendar/WeekGrid.js';
import { shortDuration } from '../../../shared/calendar/entryStyle.js';
import { useCalendarStore, weekFor } from '../../stores/calendarStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useThreadStore } from '../../stores/threadStore.js';

/**
 * The calendar. The generated week, and the week that actually happened, on one surface.
 *
 * Three scopes, and they answer three different questions rather than being three sizes of the
 * same one. The month is *pattern* — where the good weeks were. The week is *shape* — did the
 * plan survive contact. The day is *sequence* — what now, and did the last thing happen. That is
 * why each is drawn differently instead of one grid rendered at three zoom levels.
 *
 * Everything here is read from the backend's projection (`GET /calendar`) when there is a
 * connection and rebuilt identically from local files when there is not. Nothing on this page
 * waits for the network — see `CalendarService`.
 */
export function CalendarView(): React.JSX.Element {
  const scope = useCalendarStore((s) => s.scope);
  const anchor = useCalendarStore((s) => s.anchor);
  const calendar = useCalendarStore((s) => s.calendar);
  const today = useCalendarStore((s) => s.today);
  const loading = useCalendarStore((s) => s.loading);
  const setScope = useCalendarStore((s) => s.setScope);
  const setAnchor = useCalendarStore((s) => s.setAnchor);
  const shift = useCalendarStore((s) => s.shift);
  const goToday = useCalendarStore((s) => s.goToday);

  const week = weekFor(calendar, anchor);

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 1080, margin: '0 auto' }}>
      <PageHeader
        title="Calendar"
        description="The week you generated, and the week you actually had."
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ScopeToggle scope={scope} onChange={setScope} />
            <WidgetButton />
          </div>
        }
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <NavButton label="‹" title={`Previous ${scope}`} onClick={() => shift(-1)} />
        <button
          onClick={goToday}
          title={anchor === today ? anchor : 'Back to today'}
          style={{
            background: 'none',
            border: 'none',
            cursor: anchor === today ? 'default' : 'pointer',
            color: 'var(--text)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            padding: '2px 4px',
            minWidth: 200,
            textAlign: 'left',
          }}
        >
          {rangeLabel(scope, anchor)}
        </button>
        <NavButton label="›" title={`Next ${scope}`} onClick={() => shift(1)} />

        <div style={{ flex: 1 }} />

        {calendar ? <RangeTotals calendar={calendar} /> : null}
      </div>

      {/*
        The week's headline sits above the grid rather than inside it: it is the argument the
        planner made about the whole week, and it explains a shape you are about to look at.
      */}
      {week?.headline && scope !== 'month' ? (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: '0 0 14px',
            paddingLeft: 2,
          }}
        >
          {week.headline}
        </p>
      ) : null}

      {loading || !calendar ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</p>
      ) : scope === 'day' ? (
        <DayScope />
      ) : scope === 'week' ? (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '10px 12px 14px',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-card), var(--edge-light)',
          }}
        >
          <WeekGrid
            calendar={calendar}
            today={today}
            onPickDay={(date) => {
              setAnchor(date);
              setScope('day');
            }}
          />
          <Legend />
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 14,
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-card), var(--edge-light)',
          }}
        >
          <MonthGrid
            calendar={calendar}
            today={today}
            month={anchor.slice(0, 7)}
            onPickDay={(date) => {
              setAnchor(date);
              setScope('day');
            }}
          />
          <Legend planned="Planned" actual="Focused" />
        </div>
      )}

      {/* What the week's run decided not to do. An argument you can disagree with. */}
      {week?.deferred.length && scope !== 'month' ? (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div
            style={{
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-faint)',
              marginBottom: 6,
            }}
          >
            Not this week
          </div>
          {week.deferred.map((line) => (
            <div
              key={line}
              style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 4 }}
            >
              — {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The day scope, with the one thing the shared timeline cannot provide: a Start button.
 *
 * Wired to the real session engine, exactly as the daily page's plan is — following the plan and
 * using the timer stay one action rather than two, wherever you happen to be reading the plan.
 */
function DayScope(): React.JSX.Element {
  const calendar = useCalendarStore((s) => s.calendar);
  const anchor = useCalendarStore((s) => s.anchor);
  const threads = useThreadStore((s) => s.threads);
  const running = useSessionStore((s) => s.state);

  const day = calendar?.days.find((d) => d.localDate === anchor);
  if (!day) return <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nothing for that day.</p>;

  const startable = (entry: CalendarEntry): React.ReactNode => {
    if (!entry.threadId) return null;
    const thread = threads.find((t) => t.id === entry.threadId);
    // The projection already drops ids that do not resolve, but a thread can be deleted after a
    // plan was written — so a Start button is never rendered for something it cannot start.
    if (!thread || thread.status === 'done') return null;
    const isRunning = running?.session.threadId === entry.threadId;
    return (
      <button
        onClick={() => void window.thread.invoke['session:start']({ threadId: entry.threadId! })}
        disabled={isRunning}
        title={isRunning ? 'Already running' : `Start a focus session on ${thread.title}`}
        style={{
          background: 'none',
          border: 'none',
          color: isRunning ? 'var(--text-faint)' : 'var(--amber)',
          fontSize: 11.5,
          fontFamily: 'inherit',
          cursor: isRunning ? 'default' : 'pointer',
          padding: '2px 4px',
          flexShrink: 0,
        }}
      >
        {isRunning ? 'Running' : 'Start'}
      </button>
    );
  };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '14px 16px',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-card), var(--edge-light)',
      }}
    >
      <DayTimeline day={day} action={startable} />
    </div>
  );
}

/** Planned against focused, for whatever is on screen. The one comparison worth a number. */
function RangeTotals({
  calendar,
}: {
  calendar: NonNullable<ReturnType<typeof useCalendarStore.getState>['calendar']>;
}): React.JSX.Element | null {
  const planned = calendar.days.reduce((total, day) => total + day.summary.plannedMs, 0);
  const focused = calendar.days.reduce((total, day) => total + day.summary.focusMs, 0);
  if (!planned && !focused) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5 }}>
      <span style={{ color: 'var(--text-faint)' }}>
        planned <span style={{ fontFamily: 'var(--font-mono)' }}>{shortDuration(planned) || '—'}</span>
      </span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span style={{ color: 'var(--text-muted)' }}>
        focused{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
          {shortDuration(focused) || '—'}
        </span>
      </span>
    </div>
  );
}

/**
 * What an outline means and what a fill means.
 *
 * A legend is usually a sign that a chart failed, but this one encodes the only convention the
 * view has, it is two words long, and without it the plan-versus-reality split is something you
 * have to work out rather than something you are told.
 */
function Legend({
  planned = 'Planned',
  actual = 'Happened',
}: {
  planned?: string;
  actual?: string;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid var(--line)',
        fontSize: 10.5,
        color: 'var(--text-faint)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 16,
            height: 8,
            borderRadius: 3,
            border: '1px solid color-mix(in srgb, var(--slate) 60%, transparent)',
            background: 'color-mix(in srgb, var(--slate) 14%, transparent)',
          }}
        />
        {planned}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 16,
            height: 8,
            borderRadius: 3,
            background: 'color-mix(in srgb, var(--amber) 78%, transparent)',
          }}
        />
        {actual}
      </span>
    </div>
  );
}

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: CalendarScope;
  onChange: (scope: CalendarScope) => void;
}): React.JSX.Element {
  const options: CalendarScope[] = ['day', 'week', 'month'];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((option) => {
        const active = option === scope;
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
              background: active ? 'var(--surface-raised)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Pops the calendar out into a window you can leave open beside your work. */
function WidgetButton(): React.JSX.Element {
  return (
    <button
      onClick={() => void window.thread.invoke['calendarWidget:toggle'](undefined)}
      title="Open the calendar in a floating window, above your other apps"
      style={{
        padding: '5px 12px',
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      Float
    </button>
  );
}

function NavButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

/** `Mon 24 August`, `Aug 17 – 23`, `August 2026`. Whatever names the thing on screen. */
function rangeLabel(scope: CalendarScope, anchor: string): string {
  if (!anchor) return '';
  const [y, m, d] = anchor.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  if (scope === 'day') {
    return at.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  }
  if (scope === 'month') {
    return at.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return formatWeekRange(weekKeyOf(anchor));
}
