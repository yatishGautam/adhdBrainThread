import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPackProps } from '../registry.js';

/** Rare. A pixel-art health bar labelled with the thread title drains to zero, screen-shake. */
export function BossDefeated({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <motion.div
      animate={{ x: [0, -6, 6, -4, 4, 0] }}
      transition={{ duration: 0.4, delay: 1 }}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        <div style={{ fontSize: 18, color: 'var(--amber-bright)', marginBottom: 10 }}>{payload.threadTitle}</div>
        <div
          style={{
            width: 280,
            height: 18,
            border: '2px solid var(--text)',
            padding: 2,
            imageRendering: 'pixelated',
          }}
        >
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 1, delay: 0.4, ease: 'linear' }}
            style={{ height: '100%', background: 'var(--danger)' }}
          />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5 }}
          style={{ fontSize: 24, color: 'var(--moss)', marginTop: 14, letterSpacing: '0.1em' }}
        >
          DEFEATED
        </motion.div>
      </div>
    </motion.div>
  );
}
