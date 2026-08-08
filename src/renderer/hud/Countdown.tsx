import { formatClock } from '@shared/format.js';

/** Mono with tabular figures, so digits do not jitter as the seconds tick. */
export function Countdown({ remainingMs, paused }: { remainingMs: number; paused: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      {paused ? <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>PAUSED</span> : null}
      <span className="mono" style={{ fontSize: 24, lineHeight: 1 }}>
        {formatClock(remainingMs)}
      </span>
    </div>
  );
}
