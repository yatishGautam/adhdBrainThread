/** Hover action on a todo: creates a Thread from its text, links it, never deletes the todo. */
export function PromoteToThread({ localDate, todoId }: { localDate: string; todoId: string }): React.JSX.Element {
  return (
    <button
      onClick={() => void window.thread.invoke['todo:promote']({ localDate, todoId })}
      title="Promote to thread"
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-faint)',
        cursor: 'pointer',
        fontSize: 11,
      }}
    >
      → thread
    </button>
  );
}
