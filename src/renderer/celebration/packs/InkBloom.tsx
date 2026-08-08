import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPackProps } from '../registry.js';

/** Radial ink wash, thread title stamped in the display face. Fades rather than moves — reduced-motion safe. */
export function InkBloom({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div
        initial={{ scale: 0, opacity: 0.9 }}
        animate={{ scale: 6, opacity: 0 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--amber) 0%, transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)', textAlign: 'center' }}
      >
        {payload.threadTitle}
      </motion.div>
    </div>
  );
}
