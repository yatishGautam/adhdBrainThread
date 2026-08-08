import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatDuration } from '@shared/format.js';
import type { CelebrationPackProps } from '../registry.js';

/** Rare. A full-width parade banner. Fades — reduced-motion safe. */
export function TickerTape({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 3400);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      <motion.div
        initial={{ x: '100vw' }}
        animate={{ x: '-100%' }}
        transition={{ duration: 3, ease: 'linear' }}
        style={{
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          color: 'var(--amber-bright)',
        }}
      >
        ✓ {payload.threadTitle} — {formatDuration(payload.focusMs)} focused — {payload.band}
      </motion.div>
    </div>
  );
}
