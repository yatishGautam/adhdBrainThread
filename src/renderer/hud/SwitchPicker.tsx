import { useEffect, useState } from 'react';
import type { Thread } from '@shared/domain.js';

/** Compact thread picker. No friction, no warning copy — ends the current session and starts the next. */
export function SwitchPicker({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    window.thread.invoke['threads:list'](undefined).then((all) =>
      setThreads(all.filter((t) => t.status !== 'done')),
    );
  }, []);

  const pick = async (threadId: string): Promise<void> => {
    onDone();
    await window.thread.invoke['session:switch']({ threadId });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        flex: 1,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {threads.slice(0, 6).map((thread) => (
        <button
          key={thread.id}
          onClick={() => void pick(thread.id)}
          style={{
            flexShrink: 0,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            fontSize: 12,
            cursor: 'pointer',
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {thread.title}
        </button>
      ))}
      <button
        onClick={onDone}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12 }}
      >
        ✕
      </button>
    </div>
  );
}
