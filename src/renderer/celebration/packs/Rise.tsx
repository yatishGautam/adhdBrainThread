import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPackProps } from '../registry.js';

/** The title floats up and dissolves as the step count counts down to zero. Fades — reduced-motion safe. */
export function Rise({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: -60, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2, ease: 'easeOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text)' }}
        >
          {payload.threadTitle}
        </motion.div>
        {payload.steps > 0 ? (
          <motion.div
            className="mono"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 1, duration: 1 }}
            style={{ fontSize: 14, color: 'var(--moss)', marginTop: 8 }}
          >
            {payload.steps} steps done
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
