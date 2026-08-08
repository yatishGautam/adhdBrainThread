import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@shared/analytics.js';

/** `null` renders as a gap in the line — a blank day looks like absence, never failure. */
export function TrendChart({ trend }: { trend: TrendPoint[] }): React.JSX.Element {
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--text-faint)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-muted)' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--amber)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
