import { useEffect, useRef, useState } from 'react';
import type { Goal } from '@shared/domain.js';
import { formatWeekRelative, shiftWeek } from '@shared/week.js';
import { Checkbox } from '../../../shared/components/Checkbox.js';
import { useGoalStore } from '../../stores/goalStore.js';

/**
 * One goal: a checkbox and a line, and nothing else until you ask for more.
 *
 * The collapsed row is the whole point. A weekly list has to be readable in one glance or it
 * stops being looked at, so however much context is written underneath, the row stays one line
 * — the context shows as a small count, not as text. Expanding is a click on the row; the
 * textarea underneath is plain and unlabelled because it accepts anything.
 */
export function GoalRow({ goal }: { goal: Goal }): React.JSX.Element {
  const currentWeek = useGoalStore((s) => s.currentWeek);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [context, setContext] = useState(goal.context);
  const contextRef = useRef<HTMLTextAreaElement>(null);

  // A goal edited in another window, or carried over, has to win over stale local state.
  useEffect(() => setTitle(goal.title), [goal.title]);
  useEffect(() => setContext(goal.context), [goal.context]);

  useEffect(() => {
    if (!open || !contextRef.current) return;
    const el = contextRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [open, context]);

  const commitTitle = async (): Promise<void> => {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === goal.title) {
      setTitle(goal.title);
      return;
    }
    await window.thread.invoke['goals:update']({ id: goal.id, patch: { title: trimmed } });
  };

  // Context saves on blur rather than on every keystroke: it is long-form text, and a write per
  // character would mean a disk write per character.
  const commitContext = async (): Promise<void> => {
    if (context === goal.context) return;
    await window.thread.invoke['goals:update']({ id: goal.id, patch: { context } });
  };

  const contextLines = goal.context.trim()
    ? goal.context.trim().split('\n').filter(Boolean).length
    : 0;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 10,
        border: `1px solid ${open ? 'var(--line)' : 'transparent'}`,
        background: open ? 'var(--surface-raised)' : 'transparent',
        transition: 'background var(--motion-fast) var(--ease-out)',
        marginBottom: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px' }}>
        <Checkbox
          checked={goal.done}
          onChange={() => void window.thread.invoke['goals:toggle']({ id: goal.id })}
          title={goal.done ? 'Not done after all' : 'Done'}
        />

        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitTitle();
              if (e.key === 'Escape') {
                setTitle(goal.title);
                setEditingTitle(false);
              }
            }}
            style={{ flex: 1, fontSize: 13.5, padding: 0 }}
          />
        ) : (
          <button
            onClick={() => setOpen((v) => !v)}
            onDoubleClick={() => setEditingTitle(true)}
            title={contextLines ? 'Click to see the context' : 'Click to add context'}
            style={{
              flex: 1,
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13.5,
              fontFamily: 'inherit',
              color: goal.done ? 'var(--text-faint)' : 'var(--text)',
              textDecoration: goal.done ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {goal.title}
          </button>
        )}

        {/* Context is a count, never a preview — the row must stay one line however much is
            written underneath it. */}
        {contextLines && !open ? (
          <span
            title={`${contextLines} line${contextLines === 1 ? '' : 's'} of context`}
            style={{ fontSize: 10.5, color: 'var(--text-faint)', flexShrink: 0 }}
          >
            ¶ {contextLines}
          </span>
        ) : null}

        {goal.carriedFromWeek ? (
          <span
            title={`Carried over from ${formatWeekRelative(goal.carriedFromWeek, todayIsh())}`}
            style={{ fontSize: 10.5, color: 'var(--text-faint)', flexShrink: 0 }}
          >
            ↻
          </span>
        ) : null}

        <button
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Collapse' : 'Add details, steps, anything the planner should know'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-faint)',
            fontSize: 13,
            padding: '0 2px',
            opacity: hover || open ? 1 : 0.35,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--motion-fast) var(--ease-out)',
          }}
        >
          ›
        </button>

        <div
          style={{
            display: 'flex',
            gap: 4,
            opacity: hover ? 1 : 0,
            transition: 'opacity var(--motion-fast) var(--ease-out)',
          }}
        >
          {!goal.done ? (
            <RowButton
              label="→"
              title={`Move to ${formatWeekRelative(shiftWeek(currentWeek, 1), todayIsh())}`}
              onClick={() =>
                void window.thread.invoke['goals:carryOver']({
                  id: goal.id,
                  toWeek: shiftWeek(goal.weekKey, 1),
                })
              }
            />
          ) : null}
          <RowButton
            label="×"
            title="Delete this goal"
            onClick={() => void window.thread.invoke['goals:remove']({ id: goal.id })}
          />
        </div>
      </div>

      {open ? (
        <div style={{ padding: '0 10px 10px 38px' }}>
          <textarea
            ref={contextRef}
            value={context}
            placeholder={
              'Steps, links, constraints, what "done" looks like — anything that helps.\nThe planner reads this; nothing else does.'
            }
            onChange={(e) => setContext(e.target.value)}
            onBlur={() => void commitContext()}
            style={{
              width: '100%',
              minHeight: 72,
              resize: 'none',
              fontSize: 12.5,
              lineHeight: 1.55,
              fontFamily: 'inherit',
              color: 'var(--text-muted)',
              background: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function RowButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-faint)',
        fontSize: 13,
        lineHeight: 1,
        padding: '2px 3px',
      }}
    >
      {label}
    </button>
  );
}

/** Only ever used for a relative label in a tooltip, so the renderer's own date is good enough. */
function todayIsh(): string {
  return new Date().toISOString().slice(0, 10);
}
