import { motion } from 'framer-motion';
import type { BandId } from '@shared/analytics.js';

/**
 * The momentum ring — the one visual the app is remembered by. Appears at 20px in the HUD,
 * 44px on Today, 180px on Analytics; everything else stays quiet around it.
 */
const BAND_COLOR: Record<BandId, string> = {
  resting: 'var(--lavender)',
  warming: 'var(--slate)',
  rolling: 'var(--amber)',
  flow: 'var(--amber-bright)',
  lit: 'var(--moss)',
};

interface RingProps {
  value: number;
  size: number;
  band?: BandId;
  /** Explicit color, takes precedence over `band`. Used by the HUD's urgency tiers. */
  color?: string;
  strokeWidth?: number;
  dim?: boolean;
  /** A slow, gentle scale breathing — reserved for "time is nearly up", nothing else. */
  pulse?: boolean;
  children?: React.ReactNode;
}

export function Ring({ value, size, band, color, strokeWidth, dim, pulse, children }: RingProps): React.JSX.Element {
  const stroke = strokeWidth ?? Math.max(2, Math.round(size * 0.09));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - clamped);
  const resolvedColor = color ?? (band ? BAND_COLOR[band] : 'var(--amber)');

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        opacity: dim ? 0.6 : 1,
        transition: 'opacity var(--motion-slow) var(--ease-out)',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset var(--motion-slow) var(--ease-out), stroke var(--motion-slow) var(--ease-out)',
          }}
        />
      </svg>
      {children ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      ) : null}
    </motion.div>
  );
}
