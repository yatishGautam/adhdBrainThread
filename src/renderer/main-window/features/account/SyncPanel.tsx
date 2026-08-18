import { useEffect, useState } from 'react';
import type { SyncStatus } from '@shared/sync.js';

/**
 * What sync is doing, in a sentence. Deliberately small and deliberately not a blocker: every
 * write is already on disk before this says anything, so "offline" is a normal state to be in
 * rather than a failure to react to.
 */
export function SyncPanel(): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void window.thread.invoke['sync:status'](undefined).then(setStatus);
    return window.thread.on('sync:changed', setStatus);
  }, []);

  const syncNow = async (): Promise<void> => {
    setSyncing(true);
    try {
      setStatus(await window.thread.invoke['sync:now'](undefined));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{headline(status, syncing)}</p>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {detail(status)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing}
          style={{
            flexShrink: 0,
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--line)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'inherit',
            cursor: syncing ? 'default' : 'pointer',
          }}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
    </div>
  );
}

function headline(status: SyncStatus | null, syncing: boolean): string {
  if (syncing || status?.phase === 'syncing') return 'Syncing…';
  if (!status) return 'Sync';
  if (status.phase === 'offline') return 'Offline';
  if (status.phase === 'error') return 'Sync had trouble';
  if (status.pending > 0) return `${status.pending} change${status.pending === 1 ? '' : 's'} to send`;
  return 'Up to date';
}

function detail(status: SyncStatus | null): string {
  if (!status) return '';
  if (status.phase === 'offline' || status.phase === 'error') {
    // The message is already a sentence written for a person — say it, then say the part that
    // actually matters, which is that nothing has been lost.
    return `${status.message ?? ''} Your work is saved here and will go up when it can.`.trim();
  }
  if (!status.lastSyncedAt) return 'Nothing has synced yet.';
  return `Last synced ${relative(status.lastSyncedAt)}.`;
}

function relative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
