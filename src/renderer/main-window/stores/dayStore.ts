import { create } from 'zustand';
import type { Day } from '@shared/domain.js';

interface DayStore {
  today: Day | null;
  viewed: Day | null;
  viewedDate: string | null;
  dates: string[];
  setToday: (day: Day | null) => void;
  setViewed: (day: Day | null, date: string) => void;
  setDates: (dates: string[]) => void;
}

export const useDayStore = create<DayStore>((set, get) => ({
  today: null,
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
}));

export async function initDayStore(): Promise<void> {
  const [today, dates] = await Promise.all([
    window.thread.invoke['day:today'](undefined),
    window.thread.invoke['day:list'](undefined),
  ]);
  useDayStore.getState().setToday(today);
  useDayStore.getState().setDates(dates);

  window.thread.on('day:changed', (day) => {
    useDayStore.getState().setDates([...new Set([...useDayStore.getState().dates, day.localDate])].sort());
    if (day.localDate === new Date().toISOString().slice(0, 10) || useDayStore.getState().today?.localDate === day.localDate) {
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
