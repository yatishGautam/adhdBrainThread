/** Centered, full-width row of its own — the thing that was getting squeezed to a single letter. */
export function ThreadLabel({ title, nextAction }: { title: string; nextAction: string | null }): React.JSX.Element {
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <div
        title={title}
        style={{
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      {nextAction ? (
        <div
          title={nextAction}
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 1,
          }}
        >
          {nextAction}
        </div>
      ) : null}
    </div>
  );
}
