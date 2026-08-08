import { useEffect, useState } from 'react';
import type { Day, Thread } from '@shared/domain.js';
import { formatDuration } from '@shared/format.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { useUiStore } from '../../stores/uiStore.js';
import { Panel } from './Panel.js';

/** Read-only, auto-filled. The day's evidence — deserves more warmth than the other panels. */
export function LoggedPanel({ day }: { day: Day | null }): React.JSX.Element {
  const [threads, setThreads] = useState<Thread[]>([]);
  const setTab = useUiStore((s) => s.setTab);
  const ids = day?.loggedThreadIds ?? [];

  useEffect(() => {
    if (ids.length === 0) {
      setThreads([]);
      return;
    }
    Promise.all(ids.map((id) => window.thread.invoke['threads:get']({ id }))).then((results) =>
      setThreads(results.filter((t): t is Thread => t !== null)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  const sessionCount = threads.reduce((sum, t) => sum + t.sessionCount, 0);
  const focusMs = threads.reduce((sum, t) => sum + t.totalFocusMs, 0);

  return (
    <Panel title="Logged today" subtitle="Proof of what you actually did." warm>
      {threads.length === 0 ? (
        <EmptyState title="Nothing logged yet." detail="Finish a thread and it lands here on its own." />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setTab('threads')}
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '6px 4px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text)',
                }}
              >
                ✓ {thread.title}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {sessionCount} session{sessionCount === 1 ? '' : 's'} · {formatDuration(focusMs)} focused
          </div>
        </>
      )}
    </Panel>
  );
}
