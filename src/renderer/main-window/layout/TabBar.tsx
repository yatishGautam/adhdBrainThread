import { useAuthStore } from '../stores/authStore.js';
import { Avatar } from '../features/account/AccountView.js';
import { useUiStore, type MainTab } from '../stores/uiStore.js';

/** Threads · Daily · Dashboard, in that order (§1). One layout to keep in your head. */
const TABS: { id: MainTab; label: string }[] = [
  { id: 'threads', label: 'Threads' },
  { id: 'today', label: 'Daily' },
  // Between the day and the dashboard, which is where the week sits in scope as well as in time.
  { id: 'week', label: 'Week' },
  // Directly after the week: the goals are set there, and this is where you see what became of
  // them. Before the dashboard, because it is about the week in front of you rather than trends.
  { id: 'calendar', label: 'Calendar' },
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
        alignItems: 'center',
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
      <div style={{ flex: 1 }} />
      <AccountChip />
    </div>
  );
}

/**
 * Who you are, at the top of the window, next to everything else that is always true. Signed
 * out it is an invitation rather than a demand — the app below it works either way.
 */
function AccountChip(): React.JSX.Element {
  const account = useAuthStore((s) => s.account);
  const offline = useAuthStore((s) => s.offline);
  const setTab = useUiStore((s) => s.setTab);
  const active = useUiStore((s) => s.tab) === 'account';
  const name = account?.displayName?.trim() || account?.email || null;

  return (
    <button
      onClick={() => setTab('account')}
      title={account ? `Signed in as ${account.email}` : 'Sign in or create an account'}
      style={{
        WebkitAppRegion: 'no-drag',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 220,
        padding: name ? '5px 12px 5px 5px' : '7px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line)'}`,
        background: active ? 'var(--surface-raised)' : 'transparent',
        color: name ? 'var(--text)' : 'var(--text-muted)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'inherit',
        cursor: 'pointer',
      } as React.CSSProperties}
    >
      {name ? <Avatar label={name} size={24} /> : null}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name ?? 'Sign in'}
      </span>
      {/* Signed in but unreachable is its own state, and it is not a failure. */}
      {name && offline ? <span style={{ color: 'var(--text-faint)' }}>·</span> : null}
    </button>
  );
}
