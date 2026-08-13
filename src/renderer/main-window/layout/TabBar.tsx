import { useUiStore, type MainTab } from '../stores/uiStore.js';

/** Threads · Daily · Dashboard, in that order (§1). One layout to keep in your head. */
const TABS: { id: MainTab; label: string }[] = [
  { id: 'threads', label: 'Threads' },
  { id: 'today', label: 'Daily' },
  { id: 'analytics', label: 'Dashboard' },
];

/** Segmented pills rather than underlines — the active tab is a raised object, not a hint. */
export function TabBar(): React.JSX.Element {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '14px 20px 12px',
        borderBottom: '1px solid var(--line)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {TABS.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              WebkitAppRegion: 'no-drag',
              padding: '7px 16px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
              background: active ? 'var(--surface-raised)' : 'transparent',
              boxShadow: active ? 'var(--shadow-card), var(--edge-light)' : 'none',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              transition:
                'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)',
            } as React.CSSProperties}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
