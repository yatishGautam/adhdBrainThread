import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '10px 0',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease-out',
          }}
        >
          ›
        </span>
        {title}
      </button>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}>
          {children}
        </motion.div>
      ) : null}
    </div>
  );
}
