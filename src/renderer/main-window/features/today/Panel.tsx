import type { ReactNode } from 'react';
import { Hint } from '../../../shared/components/Hint.js';

export function Panel({
  title,
  subtitle,
  hint,
  warm,
  children,
}: {
  title: string;
  /** One plain sentence saying what this panel is for. Shown under the title, always. */
  subtitle?: string;
  hint?: ReactNode;
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
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: warm ? 'var(--amber)' : 'var(--text-faint)',
            }}
          >
            {title}
          </span>
          {hint ? <Hint>{hint}</Hint> : null}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
