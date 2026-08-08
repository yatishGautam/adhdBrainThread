import { formatClock } from '@shared/format.js';

/** 40px mono with tabular figures, so digits do not jitter. */
export function Countdown({ remainingMs }: { remainingMs: number }): React.JSX.Element {
  return (
    <div className="mono" style={{ fontSize: 22, flexShrink: 0 }}>
      {formatClock(remainingMs)}
    </div>
  );
}
