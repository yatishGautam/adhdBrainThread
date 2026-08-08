import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.root}>
      <p className={styles.title}>{title}</p>
      {detail ? <p className={styles.detail}>{detail}</p> : null}
      {action}
    </div>
  );
}
