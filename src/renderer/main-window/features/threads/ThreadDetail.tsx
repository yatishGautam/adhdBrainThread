import { useEffect, useState } from 'react';
import type { Session, Thread, ThreadStatus } from '@shared/domain.js';
import { StatusChip } from '../../../shared/components/Chip.js';
import { StatusDropdown } from './StatusDropdown.js';
import { Checklist } from './Checklist.js';
import { SessionHistory } from './SessionHistory.js';

export function ThreadDetail({ thread, onClose }: { thread: Thread; onClose: () => void }): React.JSX.Element {
  const [title, setTitle] = useState(thread.title);
  const [notes, setNotes] = useState(thread.notes);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    setTitle(thread.title);
    setNotes(thread.notes);
  }, [thread.id, thread.title, thread.notes]);

  useEffect(() => {
    window.thread.invoke['session:forThread']({ threadId: thread.id }).then(setSessions);
  }, [thread.id]);

  const saveTitle = async (): Promise<void> => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== thread.title) {
      await window.thread.invoke['threads:update']({ id: thread.id, patch: { title: trimmed } });
    }
  };
  const saveNotes = async (): Promise<void> => {
    if (notes !== thread.notes) {
      await window.thread.invoke['threads:update']({ id: thread.id, patch: { notes } });
    }
  };
  const setStatus = async (status: ThreadStatus, waitingOn?: string): Promise<void> => {
    await window.thread.invoke['threads:setStatus']({ id: thread.id, status, waitingOn });
  };

  return (
    <div style={{ padding: '20px 28px 60px', maxWidth: 760, margin: '0 auto' }}>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, marginBottom: 14 }}
      >
        ← Back to board
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ fontFamily: 'var(--font-display)', fontSize: 22, flex: 1 }}
        />
        <StatusDropdown status={thread.status} onChange={setStatus} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <StatusChip status={thread.status} />
        <button
          onClick={() => void window.thread.invoke['session:start']({ threadId: thread.id })}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--amber)',
            color: '#201203',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ▶ Focus
        </button>
      </div>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Steps</SectionLabel>
        <Checklist threadId={thread.id} steps={thread.steps} />
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Notes</SectionLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
          placeholder="Markdown notes…"
          rows={6}
          style={{
            width: '100%',
            resize: 'vertical',
            fontSize: 13,
            lineHeight: 1.6,
            padding: 12,
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--surface)',
          }}
        />
      </section>

      <section>
        <SectionLabel>Sessions</SectionLabel>
        <SessionHistory sessions={sessions} />
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
      {children}
    </div>
  );
}
