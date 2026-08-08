import { useState } from 'react';
import type { Step } from '@shared/domain.js';

export function Checklist({ threadId, steps }: { threadId: string; steps: Step[] }): React.JSX.Element {
  const [text, setText] = useState('');
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);
  const sorted = [...steps].sort((a, b) => a.order - b.order);

  const add = async (afterStepId?: string): Promise<void> => {
    const trimmed = text.trim();
    setText('');
    if (!trimmed) return;
    await window.thread.invoke['steps:add']({ threadId, text: trimmed, afterStepId });
  };

  const moveStep = async (stepId: string, toIndex: number): Promise<void> => {
    setDragOverStepId(null);
    setDraggingStepId(null);
    await window.thread.invoke['steps:reorder']({ threadId, stepId, toIndex });
  };

  return (
    <div>
      {sorted.map((step, index) => (
        <ChecklistItem
          key={step.id}
          threadId={threadId}
          step={step}
          isLast={index === sorted.length - 1}
          onEnterAtEnd={() => add()}
          draggable={true}
          onDragStart={() => setDraggingStepId(step.id)}
          onDragOver={(event) => {
            event.preventDefault();
            if (draggingStepId && draggingStepId !== step.id) setDragOverStepId(step.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingStepId && draggingStepId !== step.id) moveStep(draggingStepId, index);
          }}
          onDragEnd={() => {
            setDraggingStepId(null);
            setDragOverStepId(null);
          }}
          isDragOver={dragOverStepId === step.id}
          isDragging={draggingStepId === step.id}
        />
      ))}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (draggingStepId) setDragOverStepId('end');
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingStepId) moveStep(draggingStepId, sorted.length);
        }}
        style={{
          minHeight: 28,
          borderRadius: 8,
          border: `1px dashed ${dragOverStepId === 'end' ? 'var(--amber)' : 'var(--line)'}`,
          padding: 8,
          margin: '8px 0',
          color: dragOverStepId === 'end' ? 'var(--text)' : 'var(--text-faint)',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        {dragOverStepId === 'end' ? 'Release to move to the end' : 'Drag a step here to move it to the end'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--line)' }} />
        <input
          value={text}
          placeholder="Add a step…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          style={{ flex: 1, fontSize: 14, padding: '4px 0' }}
        />
      </div>
    </div>
  );
}

function ChecklistItem({
  threadId,
  step,
  isLast,
  onEnterAtEnd,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: {
  threadId: string;
  step: Step;
  isLast: boolean;
  onEnterAtEnd: () => void;
  draggable: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.text);
  const [hover, setHover] = useState(false);

  const commit = async (advance: boolean): Promise<void> => {
    setEditing(false);
    if (text.trim() && text !== step.text) {
      await window.thread.invoke['steps:update']({ threadId, stepId: step.id, text: text.trim() });
    }
    // Enter at the end of a step creates the next one — never requires reaching for the mouse.
    if (advance && isLast) onEnterAtEnd();
  };

  return (
    <div
      draggable={draggable && !editing}
      onDragStart={(event) => {
        if (!editing) {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart(event);
        }
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        borderRadius: 8,
        border: isDragOver ? '1px solid var(--amber)' : '1px solid transparent',
        background: isDragging ? 'rgba(242, 166, 90, 0.06)' : 'transparent',
        cursor: editing ? 'text' : 'grab',
      }}
    >
      <button
        onClick={() => void window.thread.invoke['steps:toggle']({ threadId, stepId: step.id })}
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1px solid ${step.done ? 'var(--moss)' : 'var(--line)'}`,
          background: step.done ? 'var(--moss)' : 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit(true);
            if (e.key === 'Escape') {
              setText(step.text);
              setEditing(false);
            }
          }}
          style={{ flex: 1, fontSize: 14 }}
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          style={{
            flex: 1,
            fontSize: 14,
            textDecoration: step.done ? 'line-through' : 'none',
            color: step.done ? 'var(--text-faint)' : 'var(--text)',
          }}
        >
          {step.text}
        </span>
      )}
      {hover && !editing ? (
        <button
          onClick={() => void window.thread.invoke['steps:remove']({ threadId, stepId: step.id })}
          style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12 }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
