import { useState } from 'react';
import type { Thread } from '@shared/domain.js';
import { DONE_RECENT_DAYS } from '@shared/constants.js';
import { formatLocalDate } from '@shared/format.js';
import { Collapsible } from '../../../shared/components/Collapsible.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { ThreadDetail } from './ThreadDetail.js';

/** Collapsed by default, grouped by completion date, last 30 days with a load-more into the archive. */
export function DoneSection(): React.JSX.Element {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async (before?: string): Promise<void> => {
    const page = await window.thread.invoke['threads:done']({ before, limit: 20 });
    setThreads((prev) => [...prev, ...page.threads]);
    setHasMore(page.hasMore);
    setLoaded(true);
  };

  if (openId) {
    const thread = threads.find((t) => t.id === openId);
    if (thread) return <ThreadDetail thread={thread} onClose={() => setOpenId(null)} />;
  }

  const groups = groupByDate(threads);

  return (
    <div style={{ marginTop: 32 }}>
      <Collapsible
        title={<span>Done {loaded ? `(${threads.length}${hasMore ? '+' : ''})` : ''}</span>}
        defaultOpen={false}
      >
        {!loaded ? (
          <button
            onClick={() => void load()}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '8px 0' }}
          >
            Load recent completions ({DONE_RECENT_DAYS} days)…
          </button>
        ) : threads.length === 0 ? (
          <EmptyState title="Nothing completed yet." />
        ) : (
          <div style={{ paddingBottom: 12 }}>
            {groups.map((group) => (
              <div key={group.date} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
                  {formatLocalDate(group.date)}
                </div>
                {group.threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setOpenId(thread.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--surface)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 13,
                      marginBottom: 4,
                    }}
                  >
                    ✓ {thread.title}
                  </button>
                ))}
              </div>
            ))}
            {hasMore ? (
              <button
                onClick={() => void load(groups[groups.length - 1]?.date)}
                style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 12 }}
              >
                Load more
              </button>
            ) : null}
          </div>
        )}
      </Collapsible>
    </div>
  );
}

function groupByDate(threads: Thread[]): { date: string; threads: Thread[] }[] {
  const map = new Map<string, Thread[]>();
  for (const thread of threads) {
    const date = thread.completedLocalDate ?? 'unknown';
    const list = map.get(date);
    if (list) list.push(thread);
    else map.set(date, [thread]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, threads: list }));
}
