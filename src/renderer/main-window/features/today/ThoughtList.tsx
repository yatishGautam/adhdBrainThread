import { useState } from 'react';
import type { Day, Thought } from '@shared/domain.js';
import type { ThoughtAction } from '@shared/ipc/channels.js';

export function ThoughtList({ day, readOnly }: { day: Day; readOnly: boolean }): React.JSX.Element {
  const thoughts = [...day.thoughts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {thoughts.map((thought) => (
        <ThoughtRow key={thought.id} localDate={day.localDate} thought={thought} readOnly={readOnly} />
      ))}
    </div>
  );
}

function ThoughtRow({
  localDate,
  thought,
  readOnly,
}: {
  localDate: string;
  thought: Thought;
  readOnly: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const process = async (action: ThoughtAction): Promise<void> => {
    setOpen(false);
    await window.thread.invoke['thought:process']({ localDate, thoughtId: thought.id, action });
  };

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        background: thought.processed ? 'transparent' : 'var(--surface-raised)',
        opacity: thought.processed ? 0.5 : 1,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{thought.text}</span>
        {!readOnly && !thought.processed ? (
          <button
            onClick={() => setOpen((v) => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
          >
            Process
          </button>
        ) : null}
      </div>
      {open ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={() => void process('thread')} style={linkBtn}>
            → thread
          </button>
          <button onClick={() => void process('todo')} style={linkBtn}>
            → todo
          </button>
          <button onClick={() => void process('dismiss')} style={linkBtn}>
            dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--amber)',
  cursor: 'pointer',
  fontSize: 11,
};
