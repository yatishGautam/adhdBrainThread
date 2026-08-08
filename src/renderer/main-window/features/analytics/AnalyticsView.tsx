import { useEffect, useState } from 'react';
import type { MomentumScope, ScopeSummary } from '@shared/analytics.js';
import { formatDuration } from '@shared/format.js';
import { ScopeToggle } from './ScopeToggle.js';
import { MomentumRing } from './MomentumRing.js';
import { TrendChart } from './TrendChart.js';
import { StatTile } from './StatTile.js';
import { InsightCard } from './InsightCard.js';
import { DistractionSection } from './DistractionSection.js';
import { ActiveDays } from './ActiveDays.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';

/**
 * Real-time: every mutation updates rollups in main and pushes here. No refresh button. Every
 * scope shows the same four blocks so the page is learnable.
 */
export function AnalyticsView(): React.JSX.Element {
  const [scope, setScope] = useState<MomentumScope>('day');
  const [anchor, setAnchor] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<ScopeSummary | null>(null);

  const refresh = (): void => {
    void window.thread.invoke['analytics:scope']({ scope, anchor }).then(setSummary);
  };

  useEffect(refresh, [scope, anchor]);
  useEffect(() => window.thread.on('analytics:changed', refresh), [scope, anchor]);

  const shift = (direction: -1 | 1): void => {
    setAnchor((current) => shiftLocal(scope, current, direction));
  };

  if (!summary) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Analytics"
        description="Patterns, not scores. Nothing here can be failed or broken."
        right={<ScopeToggle scope={scope} onChange={(next) => setScope(next)} />}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => shift(-1)} style={navBtn}>
          ‹
        </button>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', minWidth: 160, textAlign: 'center' }}>
          {summary.label}
        </span>
        <button onClick={() => shift(1)} disabled={summary.atLatest} style={navBtn}>
          ›
        </button>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'center', marginBottom: 28 }}>
        <MomentumRing value={summary.momentum} band={summary.band} />
        <div style={{ flex: 1 }}>
          <TrendChart trend={summary.trend} />
          <ActiveDays active={summary.activeDays.active} window={summary.activeDays.window} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatTile label="Sessions started" value={String(summary.sessionsStarted)} />
        <StatTile label="Focus time" value={formatDuration(summary.focusMs)} />
        <StatTile label="Threads completed" value={String(summary.threadsCompleted)} />
      </div>

      <InsightCard insight={summary.insight} />
      <DistractionSection stats={summary.distractions} />
    </div>
  );
}

function shiftLocal(scope: MomentumScope, anchor: string, direction: -1 | 1): string {
  const [y, m, d] = anchor.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (scope === 'day') date.setUTCDate(date.getUTCDate() + direction);
  else if (scope === 'week') date.setUTCDate(date.getUTCDate() + direction * 7);
  else date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}

const navBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
};
