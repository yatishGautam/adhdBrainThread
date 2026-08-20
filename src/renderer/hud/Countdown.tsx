import { motion } from 'framer-motion';
import { formatClock } from '@shared/format.js';
import { urgencyColor, type Urgency } from './urgency.js';

/**
 * Mono with tabular figures, so digits do not jitter as the seconds tick. The whole block gets
 * a slow breathing pulse in the final stretch — a felt sense the clock is closing in, not just
 * a number changing. Never red; intensity comes from amber → amber-bright plus motion.
 */
export function Countdown({
  remainingMs,
  paused,
  urgency,
}: {
  remainingMs: number;
  paused: boolean;
  urgency: Urgency;
}): React.JSX.Element {
  const pulsing = !paused && urgency === 'urgent';

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      {paused ? <span style={{ fontSize: 10, color: 'var(--hud-text-faint)' }}>PAUSED</span> : null}
      <motion.span
        className="mono"
        animate={pulsing ? { opacity: [1, 0.7, 1] } : { opacity: 1 }}
        transition={pulsing ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        style={{
          fontSize: 26,
          lineHeight: 1,
          fontWeight: 600,
          color: paused ? 'var(--hud-text-muted)' : urgencyColor(urgency),
          display: 'inline-block',
        }}
      >
        {formatClock(remainingMs)}
      </motion.span>
    </div>
  );
}
