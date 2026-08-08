import { useState } from 'react';
import type { Thread, ThreadStatus } from '@shared/domain.js';
import { StatusChip } from '../../../shared/components/Chip.js';
import { StatusDropdown } from './StatusDropdown.js';
import { NextAction } from './NextAction.js';

export function ThreadCard({ thread, onOpen }: { thread: Thread; onOpen: () => void }): React.JSX.Element {
  const [starting, setStarting] = useState(false);
  const done = thread.steps.filter((s) => s.done).length;

  const focus = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    setStarting(true);
    try {
      await window.thread.invoke['session:start']({ threadId: thread.id });
    } finally {
      setStarting(false);
    }
  };

  const setStatus = async (status: ThreadStatus, waitingOn?: string): Promise<void> => {
    await window.thread.invoke['threads:setStatus']({ id: thread.id, status, waitingOn });
  };

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        cursor: 'pointer',
        transition: 'border-color var(--motion-fast) var(--ease-out)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {thread.title}
          </span>
          {thread.steps.length > 0 ? (
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {done}/{thread.steps.length}
            </span>
          ) : null}
        </div>
        <NextAction thread={thread} />
        {thread.status === 'waiting' && thread.waitingOn ? (
          <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>Waiting on: {thread.waitingOn}</div>
        ) : null}
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusDropdown status={thread.status} onChange={setStatus} />
        <button
          onClick={focus}
          disabled={starting}
          title="Focus"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--amber)',
            color: '#201203',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
          }}
        >
          ▶
        </button>
      </div>
    </div>
  );
}

export { StatusChip };
