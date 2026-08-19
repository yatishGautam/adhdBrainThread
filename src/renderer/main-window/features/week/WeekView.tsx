import { useState } from 'react';
import { formatWeekRange, formatWeekRelative, shiftWeek, weekStart } from '@shared/week.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Panel } from '../today/Panel.js';
import { useGoalStore } from '../../stores/goalStore.js';
import { GoalRow } from './GoalRow.js';
import { PlannerSettings } from './PlannerSettings.js';
import { WeekPlanPanel } from './WeekPlanPanel.js';

/**
 * The week: a handful of goals, the plan built from them, and the settings behind it.
 *
 * Summaries only — the block list you actually run a timer against lives on the daily page,
 * where the day is. Putting the full plan here would make this the page you check every morning,
 * and the whole point of a weekly page is that you visit it on Monday and then leave it alone.
 */
export function WeekView(): React.JSX.Element {
  const weekKey = useGoalStore((s) => s.weekKey);
  const currentWeek = useGoalStore((s) => s.currentWeek);
  const goals = useGoalStore((s) => s.goals);
  const loading = useGoalStore((s) => s.loading);
  const setWeek = useGoalStore((s) => s.setWeek);
  const [text, setText] = useState('');

  const open = goals.filter((goal) => !goal.done);
  const done = goals.filter((goal) => goal.done);

  const add = async (): Promise<void> => {
    const trimmed = text.trim();
    setText('');
    if (trimmed) await window.thread.invoke['goals:add']({ title: trimmed, weekKey });
  };

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 820, margin: '0 auto' }}>
      <PageHeader
        title="Week"
        description="A few things that would make this week count. The planner turns them into days."
        right={
          <WeekNav
            weekKey={weekKey}
            currentWeek={currentWeek}
            onChange={setWeek}
          />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Panel
          title="Goals"
          accent="var(--amber)"
          subtitle="One line each. Open one to add steps or context — the planner reads it, nothing else does."
          right={
            open.length ? (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {done.length}/{goals.length} done
              </span>
            ) : null
          }
        >
          {loading ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Loading…</p>
          ) : goals.length === 0 ? (
            <EmptyState
              title="No goals for this week yet."
              detail="Three or four is usually the honest number. Add one below."
            />
          ) : (
            <>
              {open.map((goal) => (
                <GoalRow key={goal.id} goal={goal} />
              ))}
              {done.length ? (
                <div
                  style={{
                    marginTop: open.length ? 12 : 0,
                    paddingTop: open.length ? 10 : 0,
                    borderTop: open.length ? '1px solid var(--line)' : 'none',
                  }}
                >
                  {done.map((goal) => (
                    <GoalRow key={goal.id} goal={goal} />
                  ))}
                </div>
              ) : null}
            </>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 10px',
              marginTop: 4,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                border: '1.5px dashed var(--line-strong)',
                flexShrink: 0,
              }}
            />
            <input
              value={text}
              placeholder="What would make this week a good one?"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              style={{ flex: 1, fontSize: 13.5, padding: '4px 0' }}
            />
          </div>
        </Panel>

        <WeekPlanPanel weekKey={weekKey} isCurrentWeek={weekKey === currentWeek} />

        <PlannerSettings />
      </div>
    </div>
  );
}

/** Back and forward a week, with a way home. Past weeks are readable and still editable. */
function WeekNav({
  weekKey,
  currentWeek,
  onChange,
}: {
  weekKey: string;
  currentWeek: string;
  onChange: (weekKey: string) => void;
}): React.JSX.Element {
  if (!weekKey) return <div />;
  const relative = formatWeekRelative(weekKey, weekStart(currentWeek));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <NavButton label="‹" title="Previous week" onClick={() => onChange(shiftWeek(weekKey, -1))} />
      <button
        onClick={() => onChange(currentWeek)}
        title={weekKey === currentWeek ? weekKey : 'Back to this week'}
        style={{
          background: 'none',
          border: 'none',
          cursor: weekKey === currentWeek ? 'default' : 'pointer',
          textAlign: 'center',
          minWidth: 132,
          padding: 0,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{relative}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
          {formatWeekRange(weekKey)}
        </div>
      </button>
      <NavButton label="›" title="Next week" onClick={() => onChange(shiftWeek(weekKey, 1))} />
    </div>
  );
}

function NavButton({
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
        width: 26,
        height: 26,
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
