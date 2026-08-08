import type { Insight } from '@shared/analytics.js';

/** One pattern observation, never a verdict. Down periods get neutral copy, never sad copy. */
export function InsightCard({ insight }: { insight: Insight }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))',
        border: '1px solid var(--line)',
        marginBottom: 20,
      }}
    >
      <div style={{ fontSize: 14 }}>{insight.headline}</div>
      {insight.detail ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{insight.detail}</div>
      ) : null}
    </div>
  );
}
