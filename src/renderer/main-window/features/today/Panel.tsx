import type { ReactNode } from 'react';

export function Panel({
  title,
  warm,
  children,
}: {
  title: string;
  warm?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--line)',
        // "Logged today" gets slightly more visual warmth — it's the day's evidence.
        background: warm ? 'color-mix(in srgb, var(--amber) 6%, var(--surface))' : 'var(--surface)',
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: warm ? 'var(--amber)' : 'var(--text-faint)',
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
