import type { ReactNode } from 'react';

/** Every page says what it is for in one plain sentence, directly under its title. */
export function PageHeader({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{description}</p>
      </div>
      {right}
    </div>
  );
}
