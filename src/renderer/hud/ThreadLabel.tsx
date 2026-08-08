export function ThreadLabel({ title, nextAction }: { title: string; nextAction: string | null }): React.JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      {nextAction ? (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {nextAction}
        </div>
      ) : null}
    </div>
  );
}
