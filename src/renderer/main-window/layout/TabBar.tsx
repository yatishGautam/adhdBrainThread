import { useUiStore, type MainTab } from '../stores/uiStore.js';

const TABS: { id: MainTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'threads', label: 'Threads' },
  { id: 'analytics', label: 'Analytics' },
];

export function TabBar(): React.JSX.Element {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '12px 20px 0',
        borderBottom: '1px solid var(--line)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {TABS.map((item) => (
        <button
          key={item.id}
          onClick={() => setTab(item.id)}
          style={{
            WebkitAppRegion: 'no-drag',
            background: 'none',
            border: 'none',
            borderBottom: tab === item.id ? '2px solid var(--amber)' : '2px solid transparent',
            color: tab === item.id ? 'var(--text)' : 'var(--text-muted)',
            padding: '8px 14px',
            fontSize: 14,
            fontWeight: tab === item.id ? 600 : 400,
            cursor: 'pointer',
          } as React.CSSProperties}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
