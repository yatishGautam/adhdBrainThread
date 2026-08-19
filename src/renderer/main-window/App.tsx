import { useEffect, useState } from 'react';
import type { RecoveryOffer, StorageBanner } from '@shared/ipc/channels.js';
import { formatDuration } from '@shared/format.js';
import { initThreadStore } from './stores/threadStore.js';
import { initDayStore } from './stores/dayStore.js';
import { initCarryStore } from './stores/carryStore.js';
import { initSessionStore, useSessionStore } from './stores/sessionStore.js';
import { initAuthStore } from './stores/authStore.js';
import { initGoalStore } from './stores/goalStore.js';
import { initPlanStore } from './stores/planStore.js';
import { initCalendarStore } from './stores/calendarStore.js';
import { Shell } from './layout/Shell.js';

let initialized = false;

export function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [banner, setBanner] = useState<StorageBanner | null>(null);
  const recovery = useSessionStore((s) => s.recovery);
  const setRecovery = useSessionStore((s) => s.setRecovery);

  useEffect(() => {
    if (initialized) {
      setReady(true);
      return;
    }
    initialized = true;
    Promise.all([
      initThreadStore(),
      initDayStore(),
      initCarryStore(),
      initSessionStore(),
      initAuthStore(),
      initGoalStore(),
      initPlanStore(),
      initCalendarStore(),
    ]).then(() => setReady(true));
    window.thread.on('storage:banner', setBanner);
  }, []);

  if (!ready) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <>
      {banner ? <RepairBanner banner={banner} onDismiss={() => setBanner(null)} /> : null}
      {recovery ? <RecoveryPrompt offer={recovery} onDone={() => setRecovery(null)} /> : null}
      <Shell />
    </>
  );
}

function RepairBanner({ banner, onDismiss }: { banner: StorageBanner; onDismiss: () => void }): React.JSX.Element {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--line)',
        padding: '8px 16px',
        fontSize: 12,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{banner.message}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
      >
        Dismiss
      </button>
    </div>
  );
}

/** "Count it?" — time that was actually spent must never be silently discarded. */
function RecoveryPrompt({ offer, onDone }: { offer: RecoveryOffer; onDone: () => void }): React.JSX.Element {
  const resolve = async (keep: boolean): Promise<void> => {
    await window.thread.invoke['session:resolveRecovery']({ sessionId: offer.sessionId, keep });
    onDone();
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,17,21,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 360,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 16px', fontSize: 15 }}>
          You were on &lsquo;{offer.threadTitle}&rsquo; for {formatDuration(offer.activeMs)} when the app
          closed. Count it?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => void resolve(false)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Discard
          </button>
          <button
            onClick={() => void resolve(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--amber)',
              color: '#201203',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Keep
          </button>
        </div>
      </div>
    </div>
  );
}
