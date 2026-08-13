import { create } from 'zustand';

/** 'park' is a full page but not a tab — reached from the dashboard stat or the Park panel. */
export type MainTab = 'today' | 'threads' | 'analytics' | 'park';

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
  setTab: (tab) => set((state) => ({ tab, prevTab: state.tab === 'park' ? state.prevTab : state.tab })),
  toggleRail: () =>
    set((state) => {
      const next = !state.railCollapsed;
      void window.thread.invoke['settings:update']({ patch: { railCollapsed: next } });
      return { railCollapsed: next };
    }),
  setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
}));
