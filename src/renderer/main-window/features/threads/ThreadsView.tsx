import { useEffect, useMemo, useState } from 'react';
import { WIP_IN_PROGRESS_CAP, BOARD_SOFT_CAP } from '@shared/constants.js';
import type { Thread } from '@shared/domain.js';
import { useThreadStore } from '../../stores/threadStore.js';
import { ThreadCard } from './ThreadCard.js';
import { DoneSection } from './DoneSection.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Button } from '../../../shared/components/Button.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';
import { Checklist } from './Checklist.js';

export function ThreadsView(): React.JSX.Element {
  const threads = useThreadStore((s) => s.threads);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const board = useMemo(() => threads.filter((t) => t.status !== 'done'), [threads]);
  const inProgressCount = board.filter((t) => t.status === 'in_progress').length;

  const create = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    const thread = await window.thread.invoke['threads:create']({ title: trimmed });
    setTitle('');
    setCreating(false);
    setExpandedId(thread.id);
  };

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 920, margin: '0 auto' }}>
      <PageHeader
        title="Threads"
        description="Everything you're working on. Each thread keeps its own checklist."
        right={
          <span
            title={`A gentle limit: at most ${WIP_IN_PROGRESS_CAP} threads marked "In progress" at once.`}
            style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', paddingTop: 6 }}
          >
            {inProgressCount} of {WIP_IN_PROGRESS_CAP} in progress
          </span>
        }
      />

      {board.length > BOARD_SOFT_CAP ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {board.length} open threads — might be worth closing a few out. (Not a rule, just a nudge.)
        </p>
      ) : null}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {board.length === 0 && !creating ? (
          <EmptyState
            title="Nothing on the board yet."
            detail="A thread is one thing you're working on — a bug, an errand, a chapter."
            action={<Button variant="primary" onClick={() => setCreating(true)}>New thread</Button>}
          />
        ) : (
          board
            .sort(sortBoard)
            .map((thread) => (
              <div key={thread.id}>
                <ThreadCard
                  thread={thread}
                  expanded={expandedId === thread.id}
                  onToggle={() => setExpandedId(expandedId === thread.id ? null : thread.id)}
                />
                {expandedId === thread.id ? <ThreadExpanded thread={thread} /> : null}
              </div>
            ))
        )}

        {creating ? (
          <input
            autoFocus
            value={title}
            placeholder="What are you working on?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
              if (e.key === 'Escape') setCreating(false);
            }}
            onBlur={() => void create()}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'var(--surface-raised)',
              fontSize: 14,
            }}
          />
        ) : board.length > 0 ? (
          <Button onClick={() => setCreating(true)} style={{ alignSelf: 'flex-start' }}>
            + New thread
          </Button>
        ) : null}
      </div>

      <DoneSection />
    </div>
  );
}

function ThreadExpanded({ thread }: { thread: Thread }): React.JSX.Element {
  const [notes, setNotes] = useState(thread.notes);

  useEffect(() => {
    setNotes(thread.notes);
  }, [thread.id, thread.notes]);

  const saveNotes = async (): Promise<void> => {
    if (notes !== thread.notes) {
      await window.thread.invoke['threads:update']({ id: thread.id, patch: { notes } });
    }
  };

  return (
    <div
      style={{
        margin: '10px 0 18px',
        padding: 18,
        borderRadius: 14,
        border: '1px solid var(--line)',
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <Checklist threadId={thread.id} steps={thread.steps} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Notes
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
          placeholder="Markdown notes…"
          rows={5}
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
      </div>
    </div>
  );
}

const STATUS_ORDER: Record<Thread['status'], number> = { in_progress: 0, waiting: 1, idle: 2, done: 3 };
function sortBoard(a: Thread, b: Thread): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt);
}
