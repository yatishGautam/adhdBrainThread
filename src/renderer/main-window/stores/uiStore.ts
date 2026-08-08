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
  tab: 'today',
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
