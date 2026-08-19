import { create } from 'zustand';
import type { Calendar, CalendarScope } from '@shared/calendar.js';
import { addLocalDays, startOfLocalMonth, endOfLocalMonth, startOfLocalWeek, todayLocalDate } from '@shared/time.js';
import { weekKeyOf } from '@shared/week.js';

/**
 * What the calendar is showing, and where it came from.
 *
 * The two-step load is the whole design and is worth stating plainly: `calendar:get` builds the
 * week from local files and always answers, and that is what paints. `calendar:refresh` asks the
 * server and swaps its answer in only if one arrives. Nothing on screen ever waits for the
 * network — see `CalendarService` for why that ordering is not interchangeable with fetching
 * first and falling back.
 *
 * `loading` is therefore only ever true before the *local* build lands, which is a few
 * milliseconds off disk. The server round trip has no spinner because nothing is waiting on it.
 */
interface CalendarStore {
  scope: CalendarScope;
  /** The date the view is centred on. Every range is derived from this and the scope. */
  anchor: string;
  calendar: Calendar | null;
  source: 'server' | 'local';
  loading: boolean;
  /** Today, kept here so a view can mark it without recomputing a timezone on every render. */
  today: string;

  setScope: (scope: CalendarScope) => void;
  setAnchor: (anchor: string) => void;
  /** Back and forward by one of whatever is being shown. */
  shift: (delta: number) => void;
  goToday: () => void;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  scope: 'week',
  anchor: '',
  calendar: null,
  source: 'local',
  loading: true,
  today: '',

  setScope: (scope) => {
    set({ scope });
    void load();
  },
  setAnchor: (anchor) => {
    set({ anchor });
    void load();
  },
  shift: (delta) => {
    const { scope, anchor } = get();
    set({ anchor: shiftBy(anchor, scope, delta) });
    void load();
  },
  goToday: () => {
    set({ anchor: get().today });
    void load();
  },
}));

/** The range a scope and an anchor imply. */
export function rangeFor(anchor: string, scope: CalendarScope): { from: string; to: string } {
  if (scope === 'day') return { from: anchor, to: anchor };
  if (scope === 'week') {
    const from = startOfLocalWeek(anchor);
    return { from, to: addLocalDays(from, 6) };
  }
  // A month grid draws whole weeks or it draws ragged edges, so the range runs from the Monday
  // on or before the 1st to the Sunday on or after the last — which is also why the trailing
  // days of the previous month are rendered greyed rather than left blank.
  const from = startOfLocalWeek(startOfLocalMonth(anchor));
  const lastRowStart = startOfLocalWeek(endOfLocalMonth(anchor));
  return { from, to: addLocalDays(lastRowStart, 6) };
}

function shiftBy(anchor: string, scope: CalendarScope, delta: number): string {
  if (scope === 'day') return addLocalDays(anchor, delta);
  if (scope === 'week') return addLocalDays(anchor, delta * 7);
  // Month arithmetic from the 1st, so stepping off the 31st never skips February.
  return stepMonths(startOfLocalMonth(anchor), delta);
}

/** Add whole months to a `YYYY-MM-01`, without the 31st-of-January problem. */
function stepMonths(firstOfMonth: string, months: number): string {
  const year = Number(firstOfMonth.slice(0, 4));
  const month = Number(firstOfMonth.slice(5, 7)) - 1 + months;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * Load the current range: local first, then the server if it will answer.
 *
 * Guarded against a stale response overwriting a newer one — the user can change scope twice
 * while a request is in flight, and the slower reply must not win. `token` is bumped on every
 * call and checked before either result is applied.
 */
let token = 0;

export async function load(): Promise<void> {
  const mine = ++token;
  const { anchor, scope } = useCalendarStore.getState();
  if (!anchor) return;
  const request = { ...rangeFor(anchor, scope), scope };

  const local = await window.thread.invoke['calendar:get'](request);
  if (mine !== token) return;
  useCalendarStore.setState({ calendar: local.calendar, source: 'local', loading: false });

  const remote = await window.thread.invoke['calendar:refresh'](request);
  // Null is ordinary — signed out, offline, anything. The local calendar stays, unremarked.
  if (!remote || mine !== token) return;
  useCalendarStore.setState({ calendar: remote.calendar, source: remote.source });
}

export async function initCalendarStore(): Promise<void> {
  const settings = await window.thread.invoke['settings:get'](undefined);
  const today = todayLocalDate(settings.timezone);
  useCalendarStore.setState({ today, anchor: today });
  await load();

  // Anything that changes what a day contains. The calendar is a read of five collections, so
  // rather than inventing a broadcast it listens to the ones that already exist — a plan run, a
  // finished session, a day edit. A sync pull announces itself through `planner:weekChanged`
  // too, which is what makes a plan made on the phone appear here without a refresh.
  const refresh = (): void => {
    void load();
  };
  window.thread.on('planner:weekChanged', refresh);
  window.thread.on('planner:changed', refresh);
  window.thread.on('day:changed', refresh);
  window.thread.on('goals:changed', refresh);
  // Only when a session *ends* — a running one ticks every second and would reload the whole
  // range with it. The running block is drawn from `session:changed` state, not from a refetch.
  window.thread.on('session:changed', (state) => {
    if (!state) refresh();
  });
}

/** The week record covering a date, for the headline and the goals above a week view. */
export function weekFor(calendar: Calendar | null, localDate: string) {
  if (!calendar) return null;
  const key = weekKeyOf(localDate);
  return calendar.weeks.find((week) => week.weekKey === key) ?? null;
}
