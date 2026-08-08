import type { Session } from '@shared/domain.js';
import { formatDuration, formatLocalDate, formatTimeOfDay } from '@shared/format.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';

export function SessionHistory({ sessions }: { sessions: Session[] }): React.JSX.Element {
  if (sessions.length === 0) return <EmptyState title="No sessions logged yet." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sessions.map((session) => (
        <div
          key={session.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--surface)',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            {formatLocalDate(session.localDate)} · {formatTimeOfDay(session.startedAt)}
          </span>
          <span className="mono">{formatDuration(session.activeMs)}</span>
          <span style={{ color: 'var(--text-faint)' }}>
            {session.distractions.length > 0
              ? `${session.distractions.length} distraction${session.distractions.length === 1 ? '' : 's'}`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
