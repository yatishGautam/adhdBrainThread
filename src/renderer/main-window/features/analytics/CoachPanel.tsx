/**
 * The coach's read of the period on screen, under the charts it explains.
 *
 * The charts say what happened; this says what it means. The text is written on the server by
 * a model reading facts the app computed — first and last touch, focus against plan, what the
 * parked distractions said, how the day run bent — and arrives as a synced record, so the same
 * words show on the phone. Nothing generates on its own: the button is the only path, and the
 * small print says what the last read cost.
 */
import { useEffect, useState } from 'react';
import type { CoachInsight } from '@shared/domain.js';
import { weekKeyOf } from '@shared/week.js';

export function CoachPanel({
  scope,
  anchor,
}: {
  scope: 'day' | 'week';
  anchor: string;
}): React.JSX.Element {
  const periodKey = scope === 'week' ? weekKeyOf(anchor) : anchor;
  const [insight, setInsight] = useState<CoachInsight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    void window.thread.invoke['insight:get']({ periodKey }).then(setInsight);
  };

  useEffect(refresh, [periodKey]);
  useEffect(
    () =>
      window.thread.on('planner:runFinished', ({ error: runError }) => {
        setBusy(false);
        if (runError) setError(runError);
        refresh();
      }),
    [periodKey],
  );

  // The server always reads *its* today — generating while looking at last Tuesday would file
  // the result under the wrong period. Past periods stay readable; only current ones generate.
  const today = localToday();
  const isCurrent = periodKey === (scope === 'week' ? weekKeyOf(today) : today);

  const generate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.thread.invoke['insight:generate']({ scope });
    } catch (raised: unknown) {
      const raw = raised instanceof Error ? raised.message : String(raised);
      setError(raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, ''));
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        padding: '18px 20px',
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-faint)',
          }}
        >
          Coach
        </span>
        {insight ? (
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            read {timeAgo(insight.generatedAt)} · ${insight.usage.costUsd.toFixed(3)}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {isCurrent ? (
          <button
            onClick={() => void generate()}
            disabled={busy}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: busy ? 'var(--text-faint)' : 'var(--amber)',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Reading…' : insight ? 'Read it again' : scope === 'week' ? 'Read my week' : 'Read my day'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ fontSize: 12, color: 'var(--clay)', marginBottom: 10 }}>{error}</div>
      ) : null}

      {insight ? (
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
            {insight.headline}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
            }}
          >
            {insight.body}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--line)',
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Try this — </span>
            <span style={{ color: 'var(--text)' }}>{insight.suggestion}</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          {isCurrent
            ? 'The coach reads what actually happened — when your day started, where focus went, what you parked, how the plan bent — and writes the part the charts cannot say. One small call, about ten seconds.'
            : 'No read was generated for this period.'}
        </div>
      )}
    </div>
  );
}

function localToday(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
