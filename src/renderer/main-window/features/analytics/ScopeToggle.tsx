import type { MomentumScope } from '@shared/analytics.js';

const SCOPES: { id: MomentumScope; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export function ScopeToggle({
  scope,
  onChange,
}: {
  scope: MomentumScope;
  onChange: (scope: MomentumScope) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 10, padding: 2 }}>
      {SCOPES.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          style={{
            padding: '5px 12px',
            borderRadius: 8,
            border: 'none',
            background: scope === option.id ? 'var(--surface-raised)' : 'transparent',
            color: scope === option.id ? 'var(--text)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
