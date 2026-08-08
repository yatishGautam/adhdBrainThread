import { useThreadStore } from '../../stores/threadStore.js';

export function ThreadPicker({
  onPick,
  onCancel,
}: {
  onPick: (threadId: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const threads = useThreadStore((s) => s.threads).filter((t) => t.status !== 'done');

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {threads.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No open threads yet.</div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => onPick(thread.id)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--surface-raised)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {thread.title}
            </button>
          ))
        )}
      </div>
      <button
        onClick={onCancel}
        style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12 }}
      >
        Cancel
      </button>
    </div>
  );
}
