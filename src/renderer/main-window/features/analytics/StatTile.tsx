export function StatTile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
      }}
    >
      <div className="mono" style={{ fontSize: 22 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
