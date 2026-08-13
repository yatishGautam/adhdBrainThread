export function StatTile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div
      className="lift"
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-card), var(--edge-light)',
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
