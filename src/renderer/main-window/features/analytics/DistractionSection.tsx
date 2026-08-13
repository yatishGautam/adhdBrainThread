import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { DistractionStats } from '@shared/analytics.js';
import { formatDuration } from '@shared/format.js';
import { useUiStore } from '../../stores/uiStore.js';

/** Framed as attention data, not failure data. Rates, not totals — totals punish long sessions. */
export function DistractionSection({ stats }: { stats: DistractionStats }): React.JSX.Element {
  const data = stats.hourHistogram.map((count, hour) => ({ hour: hourLabel(hour), count }));
  const setTab = useUiStore((s) => s.setTab);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Attention
      </div>

      {/* The rate sits alongside the raw total: a total on its own punishes long sessions. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <MiniStat label="Per focused hour" value={stats.perFocusedHour.toFixed(1)} />
        {/* The one clickable stat: it opens the Park view, where "later" actually happens. */}
        <button
          onClick={() => setTab('park')}
          className="lift"
          title="See every parked thought"
          style={{ all: 'unset', cursor: 'pointer', display: 'block', borderRadius: 10 }}
        >
          <MiniStat
            label="Parked in total →"
            value={String(stats.internal + stats.external + stats.untagged)}
          />
        </button>
        <MiniStat
          label="Median to first"
          value={stats.medianMsToFirst === null ? '—' : formatDuration(stats.medianMsToFirst)}
        />
      </div>

      {stats.internal + stats.external > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {stats.internal} internal · {stats.external} external
          {stats.untagged > 0 ? ` · ${stats.untagged} untagged` : ''}
        </div>
      ) : null}

      <div style={{ height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="hour" tick={false} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="count" fill="var(--slate)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {stats.suggestedSessionMs !== null ? (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          Sessions around {formatDuration(stats.suggestedSessionMs)} might fit your focus better — just a
          suggestion.
        </p>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="mono" style={{ fontSize: 16 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</div>
    </div>
  );
}

function hourLabel(hour: number): string {
  return hour % 6 === 0 ? `${hour}h` : '';
}
