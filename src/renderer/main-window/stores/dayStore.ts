import { create } from 'zustand';
import type { Day } from '@shared/domain.js';
import { todayLocalDate } from '@shared/time.js';

interface DayStore {
  today: Day | null;
  /**
   * Today's date string, known from boot regardless of whether a Day record exists yet — a day
   * is only created on first real interaction, so `today` itself is routinely null.
   */
  todayDate: string;
  viewed: Day | null;
  viewedDate: string | null;
  dates: string[];
  setToday: (day: Day | null) => void;
  setViewed: (day: Day | null, date: string) => void;
  setDates: (dates: string[]) => void;
  /** Back to the live view — clears any past-date selection. */
  goToday: () => void;
}

export const useDayStore = create<DayStore>((set, get) => ({
  today: null,
  todayDate: todayLocalDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
  viewed: null,
  viewedDate: null,
  dates: [],
  setToday: (day) => {
    set({ today: day });
    // The Today tab and a navigator selection pointed at today's date must never disagree.
    if (get().viewedDate === day?.localDate) set({ viewed: day });
  },
  setViewed: (day, date) => set({ viewed: day, viewedDate: date }),
  setDates: (dates) => set({ dates }),
  goToday: () => set({ viewed: null, viewedDate: null }),
}));

export async function initDayStore(): Promise<void> {
  const [today, dates, settings] = await Promise.all([
    window.thread.invoke['day:today'](undefined),
    window.thread.invoke['day:list'](undefined),
    window.thread.invoke['settings:get'](undefined),
  ]);
  useDayStore.setState({ todayDate: todayLocalDate(settings.timezone) });
  useDayStore.getState().setToday(today);
  useDayStore.getState().setDates(dates);

  window.thread.on('day:changed', (day) => {
    useDayStore.getState().setDates([...new Set([...useDayStore.getState().dates, day.localDate])].sort());
    if (day.localDate === useDayStore.getState().todayDate) {
      useDayStore.getState().setToday(day);
    }
    if (useDayStore.getState().viewedDate === day.localDate) {
      useDayStore.getState().setViewed(day, day.localDate);
    }
  });
}

export async function loadDay(localDate: string): Promise<void> {
  const day = await window.thread.invoke['day:get']({ localDate });
  useDayStore.getState().setViewed(day, localDate);
}
