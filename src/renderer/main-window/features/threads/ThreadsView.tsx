import { useMemo, useState } from 'react';
import { WIP_IN_PROGRESS_CAP, BOARD_SOFT_CAP } from '@shared/constants.js';
import type { Thread } from '@shared/domain.js';
import { useThreadStore } from '../../stores/threadStore.js';
import { ThreadCard } from './ThreadCard.js';
import { ThreadDetail } from './ThreadDetail.js';
import { DoneSection } from './DoneSection.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Button } from '../../../shared/components/Button.js';

export function ThreadsView(): React.JSX.Element {
  const threads = useThreadStore((s) => s.threads);
  const [openId, setOpenId] = useState<string | null>(null);
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
    setOpenId(thread.id);
  };

  if (openId) {
    const thread = threads.find((t) => t.id === openId);
    if (!thread) {
      setOpenId(null);
    } else {
      return <ThreadDetail thread={thread} onClose={() => setOpenId(null)} />;
    }
  }

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>Threads</h1>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {inProgressCount}/{WIP_IN_PROGRESS_CAP} in progress
        </span>
      </div>

      {board.length > BOARD_SOFT_CAP ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          {board.length} open threads — might be worth closing a few out.
        </p>
      ) : null}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {board.length === 0 && !creating ? (
          <EmptyState
            title="Nothing on the board yet."
            detail="Add the first thing you're working on."
            action={<Button variant="primary" onClick={() => setCreating(true)}>New thread</Button>}
          />
        ) : (
          board
            .sort(sortBoard)
            .map((thread) => <ThreadCard key={thread.id} thread={thread} onOpen={() => setOpenId(thread.id)} />)
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

const STATUS_ORDER: Record<Thread['status'], number> = { in_progress: 0, waiting: 1, idle: 2, done: 3 };
function sortBoard(a: Thread, b: Thread): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt);
}
