import { create } from 'zustand';
import type { Goal } from '@shared/domain.js';
import { weekKeyOf } from '@shared/week.js';

/**
 * Goals for one week at a time.
 *
 * The week being *viewed* is renderer state, but the week that *is* today comes from main —
 * the clock and timezone live there, and a renderer computing its own "today" is how a laptop
 * left open overnight ends up showing yesterday's week.
 */
interface GoalStore {
  /** The week on screen. */
  weekKey: string;
  /** The real current week, from main's clock. */
  currentWeek: string;
  goals: Goal[];
  /** Weeks that have at least one goal, newest first — for the picker. */
  weeks: string[];
  loading: boolean;
  setWeek: (weekKey: string) => void;
}

export const useGoalStore = create<GoalStore>((set) => ({
  weekKey: '',
  currentWeek: '',
  goals: [],
  weeks: [],
  loading: true,
  setWeek: (weekKey) => {
    set({ weekKey, loading: true });
    void loadWeek(weekKey);
  },
}));

export async function loadWeek(weekKey: string): Promise<void> {
  const goals = await window.thread.invoke['goals:list']({ weekKey });
  // A slow answer for a week the user has already navigated away from must not overwrite the
  // one they are looking at now.
  if (useGoalStore.getState().weekKey !== weekKey) return;
  useGoalStore.setState({ goals, loading: false });
}

export async function refreshWeeks(): Promise<void> {
  const weeks = await window.thread.invoke['goals:weeks'](undefined);
  useGoalStore.setState({ weeks });
}

export async function initGoalStore(): Promise<void> {
  // `day:today` is the cheapest way to ask main what day it thinks it is without a new channel.
  const today = await window.thread.invoke['day:today'](undefined);
  const todayDate = today?.localDate ?? new Date().toISOString().slice(0, 10);
  const current = weekKeyOf(todayDate);

  useGoalStore.setState({ weekKey: current, currentWeek: current });
  await Promise.all([loadWeek(current), refreshWeeks()]);

  window.thread.on('goals:changed', ({ weekKey, goals }) => {
    // Only adopt a list for the week actually on screen; a carry-over touches two weeks and one
    // of them is usually not the one being looked at.
    if (useGoalStore.getState().weekKey === weekKey) {
      useGoalStore.setState({ goals, loading: false });
    }
    void refreshWeeks();
  });
}
