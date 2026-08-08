import { useState } from 'react';
import type { ThreadStatus } from '@shared/domain.js';
import { StatusChip } from '../../../shared/components/Chip.js';

const OPTIONS: ThreadStatus[] = ['in_progress', 'waiting', 'idle', 'done'];

export function StatusDropdown({
  status,
  onChange,
}: {
  status: ThreadStatus;
  onChange: (status: ThreadStatus, waitingOn?: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [promptWaiting, setPromptWaiting] = useState(false);
  const [waitingText, setWaitingText] = useState('');

  const pick = (next: ThreadStatus): void => {
    setOpen(false);
    // A blocked thread with no recorded blocker is how things get lost — always ask.
    if (next === 'waiting') {
      setPromptWaiting(true);
      return;
    }
    onChange(next);
  };

  if (promptWaiting) {
    return (
      <input
        autoFocus
        placeholder="Waiting on…"
        value={waitingText}
        onChange={(e) => setWaitingText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange('waiting', waitingText);
            setPromptWaiting(false);
            setWaitingText('');
          }
          if (e.key === 'Escape') setPromptWaiting(false);
        }}
        onBlur={() => {
          if (waitingText.trim()) onChange('waiting', waitingText);
          setPromptWaiting(false);
        }}
        style={{
          fontSize: 12,
          padding: '4px 8px',
          borderRadius: 8,
          border: '1px solid var(--slate)',
          width: 140,
        }}
      />
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <StatusChip status={status} />
      </button>
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 4,
              zIndex: 10,
              minWidth: 140,
            }}
          >
            {OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => pick(option)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <StatusChip status={option} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
