import { useState } from 'react';
import type { Thread } from '@shared/domain.js';

/** The top unchecked step, rendered inline and muted — what turns the board into a menu. */
export function NextAction({ thread }: { thread: Thread }): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const next = [...thread.steps].sort((a, b) => a.order - b.order).find((s) => !s.done);

  if (next) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {next.text}
      </div>
    );
  }

  if (adding) {
    const submit = async (): Promise<void> => {
      const trimmed = text.trim();
      setAdding(false);
      setText('');
      if (trimmed) await window.thread.invoke['steps:add']({ threadId: thread.id, text: trimmed });
    };
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        onBlur={() => void submit()}
        placeholder="First step…"
        style={{ fontSize: 11, marginTop: 2, borderBottom: '1px solid var(--line)', width: '60%' }}
      />
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setAdding(true);
      }}
      style={{
        fontSize: 11,
        color: 'var(--text-faint)',
        marginTop: 2,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      + Add a first step
    </button>
  );
}
