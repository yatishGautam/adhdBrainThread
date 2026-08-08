import { useState, type ReactNode } from 'react';

/**
 * A small "what is this?" affordance. The app invents vocabulary (thread, momentum, intent),
 * so every invented word gets an explanation within one hover of where it appears.
 */
export function Hint({ children }: { children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid var(--text-faint)',
          color: 'var(--text-faint)',
          fontSize: 9,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          flexShrink: 0,
        }}
      >
        ?
      </span>
      {open ? (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 6,
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            width: 220,
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
