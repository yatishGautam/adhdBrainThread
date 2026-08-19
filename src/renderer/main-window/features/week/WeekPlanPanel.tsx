import { useEffect, useState } from 'react';
import type { DayPlan, WeekPlan } from '@shared/domain.js';
import { formatWeekRange, weekDates } from '@shared/week.js';
import { Panel } from '../today/Panel.js';
import { generatePlan, loadWeekPlan, usePlanStore } from '../../stores/planStore.js';

/**
 * The button, and what it produced.
 *
 * One press plans every day the week has left — Monday gives seven days, Friday gives three —
 * and the label says which, because that difference is the whole shape of the offer and it is
 * invisible otherwise. Generation happens on the server, so the result reaches the phone without
 * anyone pressing anything there.
 *
 * The days here are summaries, not the day itself. A block list you can act on lives on the
 * daily page, where the day is; this is the view you look at once on Monday to decide whether
 * the week is honest, and then leave alone.
 */
export function WeekPlanPanel({
  weekKey,
  isCurrentWeek,
}: {
  weekKey: string;
  isCurrentWeek: boolean;
}): React.JSX.Element {
  const week = usePlanStore((s) => s.weeks[weekKey] ?? null);
  const plans = usePlanStore((s) => s.plans);
  const generating = usePlanStore((s) => s.generating);
  const error = usePlanStore((s) => s.error);
  const setError = usePlanStore((s) => s.setError);
  const availability = usePlanStore((s) => s.state?.availability ?? null);
  const daysLeft = usePlanStore((s) => s.state?.daysLeft ?? 0);
  const [note, setNote] = useState('');

  const canPlan = Boolean(availability?.signedIn && availability?.serverReady) && isCurrentWeek;

  useEffect(() => {
    if (weekKey) void loadWeekPlan(weekKey);
  }, [weekKey]);

  const days = weekDates(weekKey)
    .map((date) => plans[date])
    .filter((plan): plan is DayPlan => Boolean(plan) && !plan?.deletedAt);

  const run = async (): Promise<void> => {
    const ok = await generatePlan(note.trim() ? { note: note.trim() } : {});
    if (ok) setNote('');
  };

  return (
    <Panel
      title="The plan"
      accent="var(--lavender)"
      subtitle={
        week
          ? `Built ${relative(week.generatedAt)} for ${formatWeekRange(weekKey)}. Regenerating replaces it.`
          : 'Turn the goals above into ordered days — every day this week has left, in one pass.'
      }
      right={week ? <Cost week={week} /> : null}
    >
      {error ? (
        <Banner text={error} onDismiss={() => setError(null)} />
      ) : null}

      {week ? (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text)',
            margin: '0 0 14px',
          }}
        >
          {week.headline}
        </p>
      ) : null}

      {days.length ? (
        <div style={{ marginBottom: 14 }}>
          {days.map((plan) => (
            <DaySummary key={plan.localDate} plan={plan} />
          ))}
        </div>
      ) : null}

      {week?.deferred.length ? (
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Not this week</div>
          {week.deferred.map((line) => (
            <p
              key={line}
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--text-muted)',
                margin: '0 0 6px',
                paddingLeft: 12,
                borderLeft: '2px solid var(--line)',
              }}
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {generating ? (
        <Working />
      ) : (
        <>
          {isCurrentWeek ? (
            <input
              value={note}
              placeholder="Anything about this week? (Thursday is meetings, low energy, deadline Friday…)"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canPlan && void run()}
              style={{
                width: '100%',
                fontSize: 12.5,
                background: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '7px 10px',
                marginBottom: 10,
              }}
            />
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => void run()}
              disabled={!canPlan}
              className={canPlan ? 'btn-launch' : undefined}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: canPlan ? 'none' : '1px solid var(--line)',
                background: canPlan ? undefined : 'transparent',
                color: canPlan ? undefined : 'var(--text-faint)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: canPlan ? 'pointer' : 'default',
              }}
            >
              {week ? 'Plan it again' : label(daysLeft)}
            </button>
            <span style={{ fontSize: 10.5, color: 'var(--text-faint)', flex: 1 }}>
              {hint({
                canPlan,
                isCurrentWeek,
                signedIn: Boolean(availability?.signedIn),
                serverReady: Boolean(availability?.serverReady),
                daysLeft,
              })}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

/** One day, in one line: when it runs, what it is for, and how much of it is planned. */
function DaySummary({ plan }: { plan: DayPlan }): React.JSX.Element {
  const focus = plan.blocks.filter((block) => block.kind === 'focus').length;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '8px 0',
        borderTop: '1px solid var(--line)',
      }}
    >
      <div style={{ width: 52, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
          {weekdayOf(plan.localDate)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {plan.localDate.slice(8)}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
          {plan.headline}
        </p>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>
          {plan.blocks.length} block{plan.blocks.length === 1 ? '' : 's'}
          {focus ? ` · ${focus} focus` : ' · nothing scheduled'}
        </div>
      </div>
    </div>
  );
}

/**
 * What the run cost, once.
 *
 * On the run rather than per day on purpose: one press is one API call that produced up to seven
 * days, and a per-day figure would total to several times the real bill.
 */
function Cost({ week }: { week: WeekPlan }): React.JSX.Element {
  return (
    <span
      title={`${week.usage.inputTokens} in, ${week.usage.outputTokens} out, via ${week.model}`}
      style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
    >
      ${week.usage.costUsd.toFixed(3)}
    </span>
  );
}

/**
 * A run takes the better part of a minute. A bare spinner for that long reads as a hang, so this
 * says what is happening — and says it is safe to leave, because it is: the plan is written on
 * the server and arrives by sync whether or not this window is still on this page.
 */
function Working(): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 10,
        padding: '14px 16px',
        fontSize: 12.5,
        color: 'var(--text-muted)',
        lineHeight: 1.6,
      }}
    >
      Reading your goals, threads and to-dos, and shaping the days around them.
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
        {elapsed}s · usually under a minute · it finishes on the server even if you navigate away
      </div>
    </div>
  );
}

function Banner({ text, onDismiss }: { text: string; onDismiss: () => void }): React.JSX.Element {
  return (
    <div
      style={{
        fontSize: 12,
        color: 'var(--clay)',
        background: 'color-mix(in srgb, var(--clay) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--clay) 30%, transparent)',
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 12,
        display: 'flex',
        gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-faint)',
  marginBottom: 6,
};

/** The days left, said as a person would. The count is the honest part of the offer. */
function label(daysLeft: number): string {
  if (daysLeft <= 1) return 'Plan the rest of today';
  if (daysLeft >= 7) return 'Plan my week';
  return `Plan the next ${daysLeft} days`;
}

function hint(state: {
  canPlan: boolean;
  isCurrentWeek: boolean;
  signedIn: boolean;
  serverReady: boolean;
  daysLeft: number;
}): string {
  if (!state.isCurrentWeek) return 'Only this week can be planned — a past week is a record, not a plan.';
  if (!state.signedIn) return 'Planning happens on the server. Sign in from Settings first.';
  if (!state.serverReady) return 'This server has no planning key configured.';
  return `One call, about a minute, and it plans ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} at once. It syncs to your phone too.`;
}

function weekdayOf(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** "just now" / "2 hours ago" / "on Monday" — enough to judge whether a plan is stale. */
function relative(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' }).replace(/^/, 'on ');
}
