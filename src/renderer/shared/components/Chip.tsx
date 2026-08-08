import type { ReactNode } from 'react';
import type { ThreadStatus } from '@shared/domain.js';
import styles from './Chip.module.css';

/**
 * Every status pairs a colour with an icon and a label, so status survives a glance and
 * colour-blindness. No red anywhere in this set — 'waiting' is calm, never a warning.
 */
const STATUS_META: Record<ThreadStatus, { label: string; icon: string; tone: string }> = {
  idle: { label: 'Idle', icon: '○', tone: 'lavender' },
  in_progress: { label: 'In progress', icon: '●', tone: 'amber' },
  waiting: { label: 'Waiting', icon: '◐', tone: 'slate' },
  done: { label: 'Done', icon: '✓', tone: 'moss' },
};

export function StatusChip({ status }: { status: ThreadStatus }): React.JSX.Element {
  const meta = STATUS_META[status];
  return (
    <span className={`${styles.chip} ${styles[meta.tone]} ${status === 'in_progress' ? styles.pulse : ''}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

export function Chip({
  tone = 'lavender',
  children,
}: {
  tone?: 'amber' | 'slate' | 'moss' | 'lavender' | 'danger';
  children: ReactNode;
}): React.JSX.Element {
  return <span className={`${styles.chip} ${styles[tone]}`}>{children}</span>;
}
