import { useState } from 'react';
import type { Day, Todo } from '@shared/domain.js';
import { PromoteToThread } from './PromoteToThread.js';

export function TodoList({ day, readOnly }: { day: Day | null; readOnly: boolean }): React.JSX.Element {
  const [text, setText] = useState('');
  const todos = [...(day?.todos ?? [])].sort((a, b) => a.order - b.order);

  const add = async (): Promise<void> => {
    const trimmed = text.trim();
    setText('');
    if (trimmed) await window.thread.invoke['todo:add']({ text: trimmed });
  };

  return (
    <div>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} readOnly={readOnly} />
      ))}
      {!readOnly ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--line)' }} />
          <input
            value={text}
            placeholder="Add a todo…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            style={{ flex: 1, fontSize: 13, padding: '4px 0' }}
          />
        </div>
      ) : null}
    </div>
  );
}

function TodoItem({ todo, readOnly }: { todo: Todo; readOnly: boolean }): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.text);
  const [hover, setHover] = useState(false);
  const localDate = todo.localDate;

  const commit = async (): Promise<void> => {
    setEditing(false);
    if (text.trim() && text !== todo.text) {
      await window.thread.invoke['todo:update']({ localDate, todoId: todo.id, text: text.trim() });
    }
  };

  if (todo.promotedToThreadId) {
    return (
      <div style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text-faint)', marginRight: 6 }}>→</span>
        {todo.text}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
    >
      <button
        disabled={readOnly}
        onClick={() => void window.thread.invoke['todo:toggle']({ localDate, todoId: todo.id })}
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          border: `1px solid ${todo.done ? 'var(--moss)' : 'var(--line)'}`,
          background: todo.done ? 'var(--moss)' : 'transparent',
          cursor: readOnly ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      />
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === 'Enter' && void commit()}
          style={{ flex: 1, fontSize: 13 }}
        />
      ) : (
        <span
          onDoubleClick={() => !readOnly && setEditing(true)}
          style={{
            flex: 1,
            fontSize: 13,
            textDecoration: todo.done ? 'line-through' : 'none',
            color: todo.done ? 'var(--text-faint)' : 'var(--text)',
          }}
        >
          {todo.text}
        </span>
      )}
      {hover && !editing && !readOnly ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!todo.promotedToThreadId ? <PromoteToThread localDate={localDate} todoId={todo.id} /> : null}
          <button
            onClick={() => void window.thread.invoke['todo:remove']({ localDate, todoId: todo.id })}
            title="Delete todo"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-faint)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
