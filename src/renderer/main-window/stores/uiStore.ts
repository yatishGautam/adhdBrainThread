import { create } from 'zustand';

/** 'park' is a full page but not a tab — reached from the dashboard stat or the Park panel. */
export type MainTab = 'today' | 'threads' | 'analytics' | 'park' | 'account';

interface UiStore {
  tab: MainTab;
  /** Where 'park' was opened from, so its back button returns you there. */
  prevTab: MainTab;
  railCollapsed: boolean;
  setTab: (tab: MainTab) => void;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  // Threads is the first tab and the board is the inventory you open the app to look at.
  tab: 'threads',
  prevTab: 'threads',
  railCollapsed: false,
  setTab: (tab) =>
    set((state) => ({
      tab,
      // Full pages remember where you came from so Back returns you there rather than to a
      // default that is not where you were.
      prevTab: state.tab === 'park' || state.tab === 'account' ? state.prevTab : state.tab,
    })),
  toggleRail: () =>
    set((state) => {
      const next = !state.railCollapsed;
      void window.thread.invoke['settings:update']({ patch: { railCollapsed: next } });
      return { railCollapsed: next };
    }),
  setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
}));
