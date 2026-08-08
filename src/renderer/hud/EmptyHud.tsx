export function EmptyHud(): React.JSX.Element {
  return (
    <div
      onClick={() => void window.thread.invoke['hud:hide'](undefined)}
      style={{
        flex: 1,
        fontSize: 12,
        color: 'var(--text-faint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      Nothing running — open Thread to pick something
    </div>
  );
}
