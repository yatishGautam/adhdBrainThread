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
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            // A warm tint pooling at the end of the title — light from the same ember as the
            // launch buttons, so every page quietly shares the signature.
            background:
              'linear-gradient(100deg, var(--text) 55%, color-mix(in srgb, var(--amber) 65%, var(--text)))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{description}</p>
      </div>
      {right}
    </div>
  );
}
