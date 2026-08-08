import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPackProps } from '../registry.js';

/** A star per completed step, connecting into a shape. Fades in — reduced-motion safe. */
export function Constellation({ payload, onDone }: CelebrationPackProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [onDone]);

  const count = Math.max(3, Math.min(12, payload.steps));
  const points = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count;
        return { x: 200 + Math.cos(angle) * 120, y: 160 + Math.sin(angle) * 90 };
      }),
    [count],
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={400} height={320} viewBox="0 0 400 320">
        {points.map((point, i) => {
          const next = points[(i + 1) % points.length];
          if (!next) return null;
          return (
            <motion.line
              key={`line-${i}`}
              x1={point.x}
              y1={point.y}
              x2={next.x}
              y2={next.y}
              stroke="var(--amber)"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.5 }}
              transition={{ delay: 0.1 * i, duration: 0.5 }}
            />
          );
        })}
        {points.map((point, i) => (
          <motion.circle
            key={`star-${i}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill="var(--amber-bright)"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 * i, duration: 0.3 }}
          />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: '30%',
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          color: 'var(--text)',
        }}
      >
        {payload.threadTitle}
      </div>
    </div>
  );
}
