import { useEffect, useState } from 'react';
import type { DayPlan, DayRun, PlanBlock, Settings } from '@shared/domain.js';
import { dayProgress, effectiveBlocks, toClock } from '@shared/dayRun.js';
import { Panel } from './Panel.js';
// The calendar's map, not a second copy of it: the block you read here and the same block
// on the calendar must not drift to different colours.
import { KIND_COLOUR, KIND_LABEL } from '../../../shared/calendar/entryStyle.js';
import {
  clearPlan,
  generateDayPlan,
  generatePlan,
  loadPlan,
  usePlanStore,
} from '../../stores/planStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useThreadStore } from '../../stores/threadStore.js';
import { useUiStore } from '../../stores/uiStore.js';

/**
 * The suggested day, at the top of the daily page.
 *
 * Three things keep this from being decoration. A block that names a real thread gets a Start
 * button wired to the actual session engine, so following the plan and using the timer are one
 * action. A block that names work with no thread behind it yet can become one in place, so
 * deciding to do something the planner suggested does not mean retyping it on another tab. And
 * what the planner dropped is printed underneath, because a plan you cannot argue with is one
 * you stop reading.
 *
 * Nothing here generates on its own. The button is the only path, it is disabled while a
 * request is in flight, and the cost of the last one is shown next to it.
 */
export function PlanSection({ localDate }: { localDate: string }): React.JSX.Element {
  const plan = usePlanStore((s) => s.plans[localDate] ?? null);
  const generating = usePlanStore((s) => s.generating);
  const error = usePlanStore((s) => s.error);
  const setError = usePlanStore((s) => s.setError);
  const availability = usePlanStore((s) => s.state?.availability ?? null);
  const daysLeft = usePlanStore((s) => s.state?.daysLeft ?? 0);
  const canPlan = Boolean(availability?.signedIn && availability?.serverReady);
  const [setupOpen, setSetupOpen] = useState(false);
  const [run, setRun] = useState<DayRun | null>(null);
  const [nowMinutes, setNowMinutes] = useState(minutesOfDay());
  const isToday = localDate === localToday();

  useEffect(() => {
    void loadPlan(localDate);
    void window.thread.invoke['dayrun:get']({ localDate }).then(setRun);
  }, [localDate]);

  useEffect(
    () =>
      window.thread.on('dayrun:changed', ({ localDate: date, run: next }) => {
        if (date === localDate) setRun(next);
      }),
    [localDate],
  );

  // Half a minute of drift is invisible on a block that lasts twenty-five.
  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(minutesOfDay()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Panel
      title="Suggested day"
      accent="var(--slate)"
      subtitle={
        plan
          ? 'Built from your weekly goals and what is open. Start a block, or make one a thread.'
          : 'Turn this week’s goals and your open work into an ordered day.'
      }
      right={
        <PlanActions
          plan={plan}
          generating={generating}
          onGenerate={() => setSetupOpen((v) => !v)}
          onClear={() => void clearPlan(localDate)}
        />
      }
    >
      {error ? (
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
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
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
      ) : null}

      {setupOpen || (!plan && !generating) ? (
        <SetupBar
          localDate={localDate}
          canPlan={canPlan}
          signedIn={Boolean(availability?.signedIn)}
          daysLeft={daysLeft}
          generating={generating}
          onDone={() => setSetupOpen(false)}
        />
      ) : null}

      {generating ? <Generating /> : null}

      {plan && !generating ? (
        <PlanBody plan={plan} run={isToday ? run : null} nowMinutes={nowMinutes} isToday={isToday} />
      ) : null}
    </Panel>
  );
}

function minutesOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function localToday(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function PlanActions({
  plan,
  generating,
  onGenerate,
  onClear,
}: {
  plan: DayPlan | null;
  generating: boolean;
  onGenerate: () => void;
  onClear: () => void;
}): React.JSX.Element | null {
  if (generating) return null;
  if (!plan) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/*
        Only plans from the old local planner carry their own cost. A day produced by a week run
        was paid for by the run, and the total for that is on the Week page — showing a share of
        it here would be a number nobody could reconcile with a bill.
      */}
      {plan.usage ? (
        <span
          title={`${plan.usage.inputTokens} in, ${plan.usage.outputTokens} out, via ${plan.model ?? 'an earlier model'}`}
          style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
        >
          ${plan.usage.costUsd.toFixed(3)}
        </span>
      ) : null}
      <button
        onClick={onGenerate}
        style={ghostButton}
        title="Generate a fresh plan — this replaces the current one and costs another call"
      >
        Redo
      </button>
      <button onClick={onClear} style={ghostButton} title="Throw this plan away">
        Clear
      </button>
    </div>
  );
}

/**
 * Wake and work times default to the settings but are editable here, because the morning you
 * wake at 11 should not require opening a settings page to get a usable plan.
 *
 * One press plans every day left in the week, not just this one — so the button says how many
 * days that is. Pressing it on a Friday is a much smaller thing than pressing it on a Monday,
 * and the label is the only place that difference is visible before the bill.
 */
function SetupBar({
  localDate,
  canPlan,
  signedIn,
  daysLeft,
  generating,
  onDone,
}: {
  localDate: string;
  canPlan: boolean;
  signedIn: boolean;
  daysLeft: number;
  generating: boolean;
  onDone: () => void;
}): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [wake, setWake] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    void window.thread.invoke['settings:get'](undefined).then((next) => {
      setSettings(next);
      setWake(next.wakeTime);
      setStart(next.dayStartTime);
      setEnd(next.dayEndTime);
    });
  }, []);

  if (!settings) return <div />;

  const run = async (): Promise<void> => {
    const ok = await generatePlan({
      localDate,
      wakeTime: wake,
      startTime: start,
      endTime: end,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (ok) {
      setNote('');
      onDone();
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Time label="Woke" value={wake} onChange={setWake} />
        <Time label="Work from" value={start} onChange={setStart} />
        <Time label="Done by" value={end} onChange={setEnd} />
      </div>

      <input
        value={note}
        placeholder="Anything about the rest of this week? (dentist Thursday, low energy, deadline Friday…)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && canPlan && !generating && void run()}
        style={{
          width: '100%',
          fontSize: 12.5,
          background: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '7px 10px',
          marginBottom: 6,
        }}
      />

      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 10 }}>
        {settings.plannerContext.trim() ? (
          <>The planner also knows your standing context — </>
        ) : (
          <>It can also know what is always true (meetings, meds, energy) — </>
        )}
        <button
          onClick={() => useUiStore.getState().setTab('week')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
            color: 'var(--text-muted)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {settings.plannerContext.trim() ? 'review it on the Week tab' : 'set it once on the Week tab'}
        </button>
        .
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => void run()}
          disabled={!canPlan || generating}
          className={canPlan && !generating ? 'btn-launch' : undefined}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: canPlan ? 'none' : '1px solid var(--line)',
            background: canPlan ? undefined : 'transparent',
            color: canPlan ? undefined : 'var(--text-faint)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: canPlan && !generating ? 'pointer' : 'default',
          }}
        >
          {generating ? 'Thinking…' : planLabel(daysLeft)}
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
          {canPlan
            ? 'One call, on the server — about a minute, and it plans every day left in the week.'
            : signedIn
              ? 'This server has no planning key configured.'
              : 'Planning happens on the server. Sign in from Settings first.'}
        </span>
      </div>
    </div>
  );
}

/** The days left, said as a person would. The count is the honest part of the offer. */
function planLabel(daysLeft: number): string {
  if (daysLeft <= 1) return 'Plan the rest of today';
  if (daysLeft >= 7) return 'Plan my week';
  return `Plan the next ${daysLeft} days`;
}

/**
 * A run takes the better part of a minute — longer than the old single-day plan. A bare spinner
 * for that long reads as a hang, so this says what is happening and roughly how long is left.
 */
function Generating(): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: '18px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid var(--line-strong)',
          borderTopColor: 'var(--amber)',
          animation: 'spin 900ms linear infinite',
        }}
      />
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          Reading your goals and shaping the day…
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {elapsed < 30 ? 'Usually about 25 seconds.' : 'Taking longer than usual — still going.'}
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  );
}

function Time({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-faint)',
        }}
      >
        {label}
      </span>
      <input
        type="time"
        value={value}
        // An empty time input would send an invalid `HH:MM` to the planner, so a cleared field
        // keeps the last good value rather than propagating the blank.
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          background: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '6px 8px',
          colorScheme: 'dark',
        }}
      />
    </label>
  );
}

function PlanBody({
  plan,
  run,
  nowMinutes,
  isToday,
}: {
  plan: DayPlan;
  run: DayRun | null;
  nowMinutes: number;
  isToday: boolean;
}): React.JSX.Element {
  const live = run && !run.endedAt ? run : null;
  const progress = live ? dayProgress(plan, live, nowMinutes) : null;
  const skipped = new Set(run?.skippedBlockIds ?? []);
  // Rows display the *effective* times: a day shifted +30 must read as the day being lived,
  // not the one that fell behind. And they read in effective order — when only the rest of the
  // day moved, the plan's own order is no longer the order the hours arrive in, and a list that
  // prints 13:00 above 12:35 is a list you stop believing.
  const shifted = live ? effectiveBlocks(plan, live) : [];
  const effectiveTimes = new Map(
    shifted.map((entry) => [
      entry.block.id,
      { start: toClock(entry.start), end: toClock(entry.end) },
    ]),
  );
  const rows = live ? shifted.map((entry) => entry.block) : plan.blocks;

  return (
    <div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text)',
          margin: '0 0 16px',
        }}
      >
        {plan.headline}
      </p>

      {isToday ? <RunBar plan={plan} run={run} nowMinutes={nowMinutes} /> : null}

      <div>
        {rows.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            localDate={plan.localDate}
            displayStart={effectiveTimes.get(block.id)?.start}
            displayEnd={effectiveTimes.get(block.id)?.end}
            isNow={progress?.current?.block.id === block.id}
            skipped={skipped.has(block.id)}
          />
        ))}
      </div>

      <AddBlock plan={plan} />

      {(plan.deferred ?? []).length ? (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-faint)',
              marginBottom: 6,
            }}
          >
            Not today
          </div>
          {(plan.deferred ?? []).map((line) => (
            <div
              key={line}
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                marginBottom: 4,
              }}
            >
              — {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Blocks that represent work. A break or a meal is not something you make a thread out of. */
const WORK_KINDS: ReadonlySet<PlanBlock['kind']> = new Set(['focus', 'admin']);

function BlockRow({
  block,
  localDate,
  displayStart,
  displayEnd,
  isNow = false,
  skipped = false,
}: {
  block: PlanBlock;
  localDate: string;
  /** Effective wall-clock times — the block's own unless the day run shifted them. */
  displayStart?: string;
  displayEnd?: string;
  /** The day run says this block's window contains the clock. */
  isNow?: boolean;
  /** Deliberately let go — dimmed, struck through, never deleted. */
  skipped?: boolean;
}): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const setError = usePlanStore((s) => s.setError);
  const threads = useThreadStore((s) => s.threads);
  const running = useSessionStore((s) => s.state);

  // A Start button only appears when the block names a thread that still exists — the service
  // already dropped ids that did not resolve, but a thread can be deleted after the fact.
  const thread = block.threadId ? threads.find((t) => t.id === block.threadId) : undefined;
  const canStart = Boolean(thread) && thread?.status !== 'done';
  const isRunning = running?.session.threadId === block.threadId;

  // The planner invents plenty of real work that has no thread behind it yet — an admin block,
  // or a focus block on something not on the board. Promoting turns the suggestion into a thread
  // and gives this block a timer, without leaving the day.
  const canPromote = !thread && WORK_KINDS.has(block.kind);

  const promote = async (): Promise<void> => {
    setPromoting(true);
    setError(null);
    try {
      await window.thread.invoke['planner:promoteBlock']({ localDate, blockId: block.id });
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error);
      setError(raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, ''));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <>
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        padding: '7px 8px',
        borderRadius: 8,
        background: isNow
          ? 'color-mix(in srgb, var(--amber) 8%, transparent)'
          : hover || editing
            ? 'var(--surface-raised)'
            : 'transparent',
        outline: isNow ? '1px solid color-mix(in srgb, var(--amber) 35%, transparent)' : 'none',
        opacity: skipped ? 0.45 : 1,
        transition: 'background var(--motion-fast) var(--ease-out)',
      }}
    >
      {isNow ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--amber)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          NOW
        </span>
      ) : null}
      <span
        className="mono"
        style={{
          fontSize: 11.5,
          color: 'var(--text-faint)',
          flexShrink: 0,
          width: 88,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {displayStart ?? block.start}–{displayEnd ?? block.end}
      </span>

      <span
        title={KIND_LABEL[block.kind]}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: KIND_COLOUR[block.kind],
          flexShrink: 0,
          alignSelf: 'center',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text)',
            textDecoration: skipped ? 'line-through' : 'none',
          }}
        >
          {block.title}
          {skipped ? (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 8, textDecoration: 'none' }}>
              let go
            </span>
          ) : null}
        </div>
        {block.why ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>
            {block.why}
          </div>
        ) : null}
      </div>

      {block.pinned ? (
        <span
          title="Pinned — you shaped this block, so a regeneration plans around it"
          style={{
            fontSize: 9,
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            flexShrink: 0,
          }}
        >
          PINNED
        </span>
      ) : null}

      <button
        onClick={() => setEditing((open) => !open)}
        title="Edit this block — time, title, kind, or move it to another day"
        style={{
          ...ghostButton,
          opacity: editing ? 1 : hover ? 1 : 0,
          color: editing ? 'var(--text)' : 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        {editing ? 'Close' : 'Edit'}
      </button>

      {canStart ? (
        <button
          onClick={() => {
            if (block.threadId) {
              void window.thread.invoke['session:start']({ threadId: block.threadId });
            }
          }}
          disabled={isRunning}
          title={isRunning ? 'Already running' : `Start a focus session on ${thread?.title}`}
          style={{
            ...ghostButton,
            opacity: isRunning ? 0.5 : hover ? 1 : 0.4,
            color: isRunning ? 'var(--text-faint)' : 'var(--amber)',
            flexShrink: 0,
          }}
        >
          {isRunning ? 'Running' : 'Start'}
        </button>
      ) : canPromote ? (
        <button
          onClick={() => void promote()}
          disabled={promoting}
          title={`Make “${block.title}” a thread on the board, so you can run a timer on it`}
          style={{
            ...ghostButton,
            // Quieter than Start: this is the offer, not the main action.
            opacity: promoting ? 0.5 : hover ? 1 : 0,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {promoting ? 'Adding…' : '+ Thread'}
        </button>
      ) : null}
    </div>

    {editing ? (
      <BlockEditor localDate={localDate} block={block} onClose={() => setEditing(false)} />
    ) : null}
    </>
  );
}

const ghostButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  fontSize: 11.5,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '2px 4px',
};

/** Minutes the whole-day stepper offers. Small enough for "I was a bit slow", both ways. */
const WHOLE_DAY_STEPS = [-15, -5, 5, 15] as const;

const nudgeLabel: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-faint)',
  fontFamily: 'var(--font-mono)',
};

const nudgeGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '1px 2px',
};

// ------------------------------------------------------------------ hand edits

/**
 * The edit panel under a block row. Everything saved here stamps the block `pinned: true` —
 * the server plans around a pinned block instead of replacing it, so an edit survives every
 * later regeneration. That is the deal that makes editing worth offering at all: the model
 * proposes, and anything you touch becomes yours.
 */
function BlockEditor({
  localDate,
  block,
  onClose,
}: {
  localDate: string;
  block: PlanBlock;
  onClose: () => void;
}): React.JSX.Element {
  const [title, setTitle] = useState(block.title);
  const [start, setStart] = useState(block.start);
  const [end, setEnd] = useState(block.end);
  const [kind, setKind] = useState<PlanBlock['kind']>(block.kind);
  const [moveTo, setMoveTo] = useState(localDate);
  const [busy, setBusy] = useState(false);
  const setError = usePlanStore((s) => s.setError);

  const invalid = timeToMinutes(end) <= timeToMinutes(start);

  const save = async (): Promise<void> => {
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.thread.invoke['planner:editBlock']({
        localDate,
        block: { ...block, title: title.trim() || 'Untitled block', start, end, kind },
      });
      if (moveTo !== localDate) {
        await window.thread.invoke['planner:moveBlock']({
          fromDate: localDate,
          toDate: moveTo,
          blockId: block.id,
        });
      }
      onClose();
    } catch (error: unknown) {
      setError(cleanError(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.thread.invoke['planner:deleteBlock']({ localDate, blockId: block.id });
      onClose();
    } catch (error: unknown) {
      setError(cleanError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        margin: '2px 8px 10px 108px',
        padding: 12,
        border: '1px solid var(--line)',
        borderRadius: 10,
        background: 'var(--surface-raised)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <input
        value={title}
        autoFocus
        placeholder="What this block is — name the first concrete action"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
        style={{
          fontSize: 13,
          background: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '7px 10px',
        }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Time label="From" value={start} onChange={setStart} />
        <Time label="Until" value={end} onChange={setEnd} />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-faint)',
            }}
          >
            Day
          </span>
          <select
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            style={{
              fontSize: 12.5,
              fontFamily: 'inherit',
              background: 'var(--ink)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '6px 8px',
              colorScheme: 'dark',
            }}
          >
            {dayOptions(localDate).map((date) => (
              <option key={date} value={date}>
                {dayOptionLabel(date, localDate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {KIND_OPTIONS.map((option) => {
          const active = kind === option;
          return (
            <button
              key={option}
              onClick={() => setKind(option)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${active ? KIND_COLOUR[option] : 'var(--line)'}`,
                background: 'transparent',
                color: active ? 'var(--text)' : 'var(--text-faint)',
                fontSize: 11.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: KIND_COLOUR[option],
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {KIND_LABEL[option]}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => void save()}
          disabled={invalid || busy}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            background: invalid ? 'var(--line)' : 'var(--amber)',
            color: invalid ? 'var(--text-faint)' : 'var(--ink)',
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: invalid || busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : moveTo !== localDate ? `Save & move` : 'Save'}
        </button>
        <button onClick={onClose} style={ghostButton}>
          Cancel
        </button>
        <span style={{ flex: 1 }} />
        {invalid ? (
          <span style={{ fontSize: 11, color: 'var(--clay, #c96f4a)' }}>
            The block ends before it starts.
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
            Saved edits are pinned — regeneration plans around them.
          </span>
        )}
        <button
          onClick={() => void remove()}
          style={{ ...ghostButton, color: 'var(--clay, #c96f4a)' }}
          title="Remove this block from the day"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** The + at the bottom of a plan: a block of your own, pinned from birth. */
function AddBlock({ plan }: { plan: DayPlan }): React.JSX.Element {
  const [draft, setDraft] = useState<PlanBlock | null>(null);

  if (!draft) {
    return (
      <button
        onClick={() => setDraft(freshBlock(plan))}
        title="Add a block of your own — it is pinned, so regeneration plans around it"
        style={{ ...ghostButton, marginTop: 6, color: 'var(--text-muted)' }}
      >
        + Add a block
      </button>
    );
  }

  return <BlockEditor localDate={plan.localDate} block={draft} onClose={() => setDraft(null)} />;
}

const KIND_OPTIONS: PlanBlock['kind'][] = ['focus', 'admin', 'break', 'meal', 'buffer', 'wind_down'];

function freshBlock(plan: DayPlan): PlanBlock {
  const last = plan.blocks[plan.blocks.length - 1];
  const start = last ? last.end : plan.startTime;
  const end = minutesToTime(Math.min(timeToMinutes(start) + 45, 23 * 60 + 59));
  return {
    // Unique within the day is the whole contract; `hand-` keeps it out of the derived-id space.
    id: `hand-${Math.random().toString(36).slice(2, 10)}`,
    start,
    end,
    kind: 'focus',
    title: '',
    pinned: true,
  };
}

function timeToMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(total: number): string {
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Today and the six days after it — where a block can be sent. */
function dayOptions(localDate: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(localDate, offset));
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayOptionLabel(date: string, today: string): string {
  if (date === today) return 'This day';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

// ------------------------------------------------------------------ the day run

/**
 * The day, run like a session: an explicit start, a live pointer, one-tap mending.
 *
 * The verbs are ordered by cost. Shift slides the rest of the day and is free; Skip lets one
 * block go and is free; Replan asks the server to reshape only the hours still ahead and costs
 * one call. Nothing here starts a timer — the run points, you ignite — and nothing shames:
 * "let go" is a real verb, not a euphemism for failure.
 */
function RunBar({
  plan,
  run,
  nowMinutes,
}: {
  plan: DayPlan;
  run: DayRun | null;
  nowMinutes: number;
}): React.JSX.Element {
  const setError = usePlanStore((s) => s.setError);
  const [busy, setBusy] = useState(false);

  const act = async (work: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (error: unknown) {
      setError(cleanError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!run || run.endedAt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px' }}>
        <button
          onClick={() =>
            void act(() => window.thread.invoke['dayrun:start']({ localDate: plan.localDate }))
          }
          className="btn-launch"
          style={{
            padding: '7px 16px',
            borderRadius: 10,
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {run?.endedAt ? 'Resume the day' : '▶ Start my day'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Keeps a live pointer on the current block, and makes running late a one-tap fix.
        </span>
      </div>
    );
  }

  const progress = dayProgress(plan, run, nowMinutes);
  const shiftedMinutes = Math.round(run.shiftMs / 60_000);

  const nudge = (deltaMs: number, scope: 'rest' | 'day'): void => {
    if (!deltaMs) return;
    void act(() =>
      window.thread.invoke['dayrun:shift']({ localDate: plan.localDate, deltaMs, scope }),
    );
  };

  const status = progress.current
    ? `Block ${progress.position} of ${progress.total}`
    : progress.next
      ? `Between blocks — next at ${toClock(progress.next.start)}`
      : 'Nothing left on the plan.';

  return (
    <div
      style={{
        border: '1px solid color-mix(in srgb, var(--amber) 30%, var(--line))',
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: 'color-mix(in srgb, var(--amber) 4%, transparent)',
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{status}</span>
      {shiftedMinutes !== 0 ? (
        <button
          onClick={() => nudge(-run.shiftMs, 'day')}
          style={{
            ...ghostButton,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
          }}
          title="Put the whole day back where the plan had it"
        >
          shifted {shiftedMinutes > 0 ? '+' : ''}
          {shiftedMinutes}m
        </button>
      ) : null}
      {progress.slipped.length ? (
        <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
          {progress.slipped.length} slipped
        </span>
      ) : null}

      <span style={{ flex: 1 }} />

      {/*
        Two different repairs, kept visibly apart. The whole day moves when the day itself
        landed at a different hour than the plan assumed — you were slow getting ready, or the
        drive gave the time back — and it moves in both directions, because arriving early is
        as real as running late. "From here" is the other case: the morning happened when it
        happened, and only what is still ahead needs to give.
      */}
      <span style={nudgeLabel}>whole day</span>
      <div style={nudgeGroup}>
        {WHOLE_DAY_STEPS.map((minutes) => (
          <button
            key={minutes}
            onClick={() => nudge(minutes * 60_000, 'day')}
            style={{ ...ghostButton, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            title={`Move every block ${Math.abs(minutes)} minutes ${
              minutes > 0 ? 'later' : 'earlier'
            }, the ones behind you included`}
          >
            {minutes > 0 ? `+${minutes}` : minutes}
          </button>
        ))}
      </div>

      <span style={nudgeLabel}>from here</span>
      <button
        onClick={() => nudge(15 * 60_000, 'rest')}
        style={ghostButton}
        title="Running late — slide everything still ahead by fifteen minutes"
      >
        +15m
      </button>
      <button
        onClick={() => nudge(30 * 60_000, 'rest')}
        style={ghostButton}
        title="Slide everything still ahead by thirty minutes"
      >
        +30m
      </button>
      {progress.current ? (
        <button
          onClick={() => {
            const blockId = progress.current?.block.id;
            if (blockId) {
              void act(() =>
                window.thread.invoke['dayrun:skip']({ localDate: plan.localDate, blockId }),
              );
            }
          }}
          style={ghostButton}
          title="Let this block go — it stays visible, struck through, and nothing shames you for it"
        >
          Skip block
        </button>
      ) : null}
      <button
        onClick={() => void act(() => generateDayPlan({ localDate: plan.localDate }))}
        style={{ ...ghostButton, color: 'var(--amber)' }}
        title="Life happened — one call replans only the hours still ahead. What happened and what you pinned stays."
      >
        Replan rest
      </button>
      <button
        onClick={() =>
          void act(() => window.thread.invoke['dayrun:end']({ localDate: plan.localDate }))
        }
        style={ghostButton}
        title="Close the day out"
      >
        End day
      </button>
    </div>
  );
}
