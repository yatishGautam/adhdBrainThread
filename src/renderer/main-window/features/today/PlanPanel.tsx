import { useState } from 'react';
import type { Day } from '@shared/domain.js';
import { INTENT_SOFT_CAP } from '@shared/constants.js';
import { useThreadStore } from '../../stores/threadStore.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Panel } from './Panel.js';
import { TodoList } from './TodoList.js';

/** Threads chosen as intent, plus todos. Both are "things I said I'd do today" but render differently. */
export function PlanPanel({ day, readOnly }: { day: Day | null; readOnly: boolean }): React.JSX.Element {
  const threads = useThreadStore((s) => s.threads);
  const [picking, setPicking] = useState(false);
  const intentThreads = threads.filter((t) => day?.intentThreadIds.includes(t.id));

  const toggleIntent = async (threadId: string): Promise<void> => {
    const current = day?.intentThreadIds ?? [];
    const next = current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId];
    await window.thread.invoke['day:setIntent']({ threadIds: next });
  };

  return (
    <Panel title="Today's plan">
      {intentThreads.length === 0 && (!day || day.todos.length === 0) ? (
        <EmptyState title="Nothing planned yet." />
      ) : null}

      {intentThreads.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {intentThreads.map((thread) => {
            const next = [...thread.steps].sort((a, b) => a.order - b.order).find((s) => !s.done);
            return (
              <div key={thread.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => void window.thread.invoke['session:start']({ threadId: thread.id })}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--amber)',
                    color: '#201203',
                    cursor: 'pointer',
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  ▶
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {thread.title}
                  </div>
                  {next ? (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{next.text}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!readOnly ? (
        <div style={{ marginBottom: 14 }}>
          {picking ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
              {threads
                .filter((t) => t.status !== 'done' && !intentThreads.some((it) => it.id === t.id))
                .map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => {
                      void toggleIntent(thread.id);
                      setPicking(false);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      background: 'var(--surface-raised)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {thread.title}
                  </button>
                ))}
              <button onClick={() => setPicking(false)} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                Done
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPicking(true)}
              style={{ fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              + Add a thread {intentThreads.length >= INTENT_SOFT_CAP ? '(getting full)' : ''}
            </button>
          )}
        </div>
      ) : null}

      <TodoList day={day} readOnly={readOnly} />
    </Panel>
  );
}
