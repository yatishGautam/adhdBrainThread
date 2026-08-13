import type { ReactNode } from 'react';
import { Hint } from '../../../shared/components/Hint.js';

/**
 * One daily-page section. Carries a real border, a slightly raised surface and a shadow so a
 * column of seven of these reads as seven cards rather than as one long dark sheet.
 */
export function Panel({
  title,
  subtitle,
  hint,
  warm,
  accent,
  right,
  children,
}: {
  title: string;
  /** One plain sentence saying what this panel is for. Shown under the title, always. */
  subtitle?: string;
  hint?: ReactNode;
  warm?: boolean;
  /** Colours the title and the left edge — how a section is recognised at a glance. */
  accent?: string;
  right?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const tone = accent ?? 'var(--slate)';
  return (
    <section
      style={{
        borderRadius: 14,
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${warm ? 'var(--amber)' : tone}`,
        background: warm
          ? 'color-mix(in srgb, var(--amber) 6%, var(--surface))'
          : 'var(--surface)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: warm ? 'var(--amber)' : tone,
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
        {right}
      </div>
      {children}
    </section>
  );
}
