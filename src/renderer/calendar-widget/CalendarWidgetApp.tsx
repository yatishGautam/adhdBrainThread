import { useEffect, useState } from 'react';
import type { Calendar, CalendarScope } from '@shared/calendar.js';
import { addLocalDays, startOfLocalMonth, endOfLocalMonth, startOfLocalWeek, todayLocalDate } from '@shared/time.js';
import { DayTimeline } from '../shared/calendar/DayTimeline.js';
import { MonthGrid } from '../shared/calendar/MonthGrid.js';
import { WeekGrid } from '../shared/calendar/WeekGrid.js';

/**
 * The floating calendar.
 *
 * The same three views as the page, drawn from the same components at `compact`, in a frameless
 * window that sits above your other apps. It exists because the alternative to glancing at a
 * calendar is *opening* one — and for the person this app is written for, alt-tabbing to another
 * window to check what was next is the exact moment the thread gets dropped and twenty minutes
 * go somewhere else.
 *
 * So it is deliberately not interactive beyond changing what it shows. There is nothing here to
 * start, tick or edit. A widget you can act in is a widget you end up working in, and then it is
 * a second app rather than a glance.
 *
 * It holds its own state rather than sharing the main window's store: the two are separate
 * renderer processes, and it would be wrong for scrolling to next week here to move the page
 * behind it — you float this precisely so you can look at something other than what you are
 * working on.
 */
export function CalendarWidgetApp(): React.JSX.Element {
  const [scope, setScope] = useState<CalendarScope>('week');
  const [anchor, setAnchor] = useState('');
  const [today, setToday] = useState('');
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  /** Bumped by anything that changes a day, to force a reload of the current range. */
  const [nonce, setNonce] = useState(0);

  // Boot: the timezone decides what "today" is, and the last scope is remembered so the widget
  // reopens showing whatever you keep glancing at.
  useEffect(() => {
    void (async () => {
      const settings = await window.thread.invoke['settings:get'](undefined);
      const now = todayLocalDate(settings.timezone);
      setToday(now);
      setAnchor(now);
      if (settings.calendarWidgetScope) setScope(settings.calendarWidgetScope);
    })();
  }, []);

  // Local first, then the server if it will answer — the same two-step the page uses, and for
  // the same reason: nothing on screen waits for the network.
  useEffect(() => {
    if (!anchor) return;
    let live = true;
    const request = { ...rangeFor(anchor, scope), scope };

    void (async () => {
      const local = await window.thread.invoke['calendar:get'](request);
      if (!live) return;
      setCalendar(local.calendar);
      const remote = await window.thread.invoke['calendar:refresh'](request);
      if (live && remote) setCalendar(remote.calendar);
    })();

    return () => {
      live = false;
    };
  }, [anchor, scope, nonce]);

  // The same events the page listens to. A plan generated on the phone lands here through sync
  // and announces itself on `planner:weekChanged`, so the floating window is never the stale one.
  useEffect(() => {
    const reload = (): void => setNonce((n) => n + 1);
    window.thread.on('planner:weekChanged', reload);
    window.thread.on('planner:changed', reload);
    window.thread.on('day:changed', reload);
    // Only when a session *ends*. A running one ticks every second, and reloading the whole
    // range on each tick would be a network request a second for a window nobody is typing in.
    window.thread.on('session:changed', (state) => {
      if (!state) reload();
    });
  }, []);

  const pick = (next: CalendarScope): void => {
    setScope(next);
    void window.thread.invoke['calendarWidget:scope']({ scope: next });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'color-mix(in srgb, var(--ink) 94%, transparent)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        overflow: 'hidden',
        // Only the title strip drags, or clicking a day would move the window instead.
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <TitleStrip
        scope={scope}
        anchor={anchor}
        today={today}
        onScope={pick}
        onShift={(delta) => setAnchor((at) => shiftBy(at, scope, delta))}
        onToday={() => setAnchor(today)}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px 10px' }}>
        {!calendar ? (
          <div style={{ padding: 14, fontSize: 11, color: 'var(--text-faint)' }}>Loading…</div>
        ) : scope === 'week' ? (
          <WeekGrid calendar={calendar} today={today} compact />
        ) : scope === 'month' ? (
          <MonthGrid calendar={calendar} today={today} month={anchor.slice(0, 7)} compact />
        ) : (
          <DayTimeline
            day={
              calendar.days.find((day) => day.localDate === anchor) ?? calendar.days[0]!
            }
            compact
          />
        )}
      </div>
    </div>
  );
}

function TitleStrip({
  scope,
  anchor,
  today,
  onScope,
  onShift,
  onToday,
}: {
  scope: CalendarScope;
  anchor: string;
  today: string;
  onScope: (scope: CalendarScope) => void;
  onShift: (delta: number) => void;
  onToday: () => void;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 6px 6px 10px',
        borderBottom: '1px solid var(--line)',
        // The one draggable region: everything else is something you click.
        WebkitAppRegion: 'drag',
        flexShrink: 0,
      } as React.CSSProperties}
    >
      <button
        onClick={onToday}
        title={anchor === today ? anchor : 'Back to today'}
        style={{
          ...bare,
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--text)',
          minWidth: 108,
          textAlign: 'left',
        }}
      >
        {label(scope, anchor)}
      </button>

      <Arrow label="‹" title="Back" onClick={() => onShift(-1)} />
      <Arrow label="›" title="Forward" onClick={() => onShift(1)} />

      <div style={{ flex: 1 }} />

      {(['day', 'week', 'month'] as const).map((option) => (
        <button
          key={option}
          onClick={() => onScope(option)}
          title={`${option[0]?.toUpperCase()}${option.slice(1)}`}
          style={{
            ...bare,
            padding: '2px 6px',
            borderRadius: 6,
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: option === scope ? 'var(--surface-raised)' : 'transparent',
            color: option === scope ? 'var(--text)' : 'var(--text-faint)',
          }}
        >
          {option[0]}
        </button>
      ))}

      <button
        onClick={() => void window.thread.invoke['calendarWidget:close'](undefined)}
        title="Close"
        style={{ ...bare, padding: '2px 6px', color: 'var(--text-faint)', fontSize: 13 }}
      >
        ×
      </button>
    </div>
  );
}

function Arrow({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button onClick={onClick} title={title} style={{ ...bare, padding: '1px 5px', fontSize: 13 }}>
      {label}
    </button>
  );
}

const bare: React.CSSProperties = {
  WebkitAppRegion: 'no-drag',
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  lineHeight: 1,
} as React.CSSProperties;

/**
 * The range a scope and an anchor imply. Kept identical to the page's `rangeFor` — the two
 * windows must ask the server the same question or they will disagree about the same week.
 */
function rangeFor(anchor: string, scope: CalendarScope): { from: string; to: string } {
  if (scope === 'day') return { from: anchor, to: anchor };
  if (scope === 'week') {
    const from = startOfLocalWeek(anchor);
    return { from, to: addLocalDays(from, 6) };
  }
  const from = startOfLocalWeek(startOfLocalMonth(anchor));
  return { from, to: addLocalDays(startOfLocalWeek(endOfLocalMonth(anchor)), 6) };
}

function shiftBy(anchor: string, scope: CalendarScope, delta: number): string {
  if (!anchor) return anchor;
  if (scope === 'day') return addLocalDays(anchor, delta);
  if (scope === 'week') return addLocalDays(anchor, delta * 7);
  const first = startOfLocalMonth(anchor);
  const month = Number(first.slice(5, 7)) - 1 + delta;
  const year = Number(first.slice(0, 4)) + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${year}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Short enough for a 560px strip. `24 Aug`, `Aug 17–23`, `Aug 2026`. */
function label(scope: CalendarScope, anchor: string): string {
  if (!anchor) return '';
  const [y, m, d] = anchor.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  if (scope === 'day') {
    return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  if (scope === 'month') {
    return at.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const from = startOfLocalWeek(anchor);
  const to = addLocalDays(from, 6);
  const month = (date: string): string =>
    new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1)).toLocaleDateString(
      'en-GB',
      { month: 'short', timeZone: 'UTC' },
    );
  const day = (date: string): number => Number(date.slice(8, 10));
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${month(from)} ${day(from)}–${day(to)}`
    : `${month(from)} ${day(from)} – ${month(to)} ${day(to)}`;
}
