import { create } from 'zustand';

export type MainTab = 'today' | 'threads' | 'analytics';

interface UiStore {
  tab: MainTab;
  railCollapsed: boolean;
  setTab: (tab: MainTab) => void;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  // Threads is the first tab and the board is the inventory you open the app to look at.
  tab: 'threads',
  railCollapsed: false,
  setTab: (tab) => set({ tab }),
  toggleRail: () =>
    set((state) => {
      const next = !state.railCollapsed;
      void window.thread.invoke['settings:update']({ patch: { railCollapsed: next } });
      return { railCollapsed: next };
    }),
  setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
}));
