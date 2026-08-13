import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPackProps } from '../registry.js';

const COLORS = ['var(--amber)', 'var(--amber-bright)', 'var(--moss)', 'var(--lavender)', 'var(--slate)'];

/**
 * Confetti + shockwave — the default pack, and the one both builds ship with so they feel
 * identical out of the box (§11). Particles burst from the top-center with an expanding ring
 * underneath them.
 */
export function ConfettiBurst({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        angle: (Math.PI * 2 * i) / 60 + Math.random() * 0.3,
        distance: 200 + Math.random() * 300,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 720 - 360,
        size: 6 + Math.random() * 6,
      })),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <motion.div
        initial={{ width: 0, height: 0, opacity: 0.8 }}
        animate={{ width: 620, height: 620, opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: '2px solid var(--amber)',
        }}
      />
      {pieces.map((piece) => (
        <motion.div
          key={piece.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: Math.cos(piece.angle) * piece.distance,
            y: Math.sin(piece.angle) * piece.distance + 200,
            opacity: 0,
            rotate: piece.rotate,
          }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            width: piece.size,
            height: piece.size * 0.6,
            background: piece.color,
            borderRadius: 2,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          color: 'var(--text)',
        }}
      >
        {payload.threadTitle}
      </div>
    </div>
  );
}
