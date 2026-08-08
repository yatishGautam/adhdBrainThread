import { AnimatePresence, motion } from 'framer-motion';

/** A calm 1.5s toast for the distraction "logged" confirmation. Never red, never alarming. */
export function Toast({ text }: { text: string | null }): React.JSX.Element {
  return (
    <AnimatePresence>
      {text ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'absolute',
            bottom: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
