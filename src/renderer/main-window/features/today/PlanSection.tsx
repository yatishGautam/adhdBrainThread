import { useEffect, useState } from 'react';
import type { DayPlan, PlanBlock, Settings } from '@shared/domain.js';
import { Panel } from './Panel.js';
import {
  clearPlan,
  generatePlan,
  loadPlan,
  usePlanStore,
} from '../../stores/planStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useThreadStore } from '../../stores/threadStore.js';

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
  const keyConfigured = usePlanStore((s) => s.state?.key.configured ?? false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    void loadPlan(localDate);
  }, [localDate]);

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
          keyConfigured={keyConfigured}
          generating={generating}
          onDone={() => setSetupOpen(false)}
        />
      ) : null}

      {generating ? <Generating /> : null}

      {plan && !generating ? <PlanBody plan={plan} /> : null}
    </Panel>
  );
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
      <span
        title={`${plan.usage.inputTokens} in, ${plan.usage.outputTokens} out, via ${plan.model}`}
        style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
      >
        ${plan.usage.costUsd.toFixed(3)}
      </span>
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
 */
function SetupBar({
  localDate,
  keyConfigured,
  generating,
  onDone,
}: {
  localDate: string;
  keyConfigured: boolean;
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
        placeholder="Anything about today only? (dentist at 3, low energy, deadline tomorrow…)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && keyConfigured && !generating && void run()}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => void run()}
          disabled={!keyConfigured || generating}
          className={keyConfigured && !generating ? 'btn-launch' : undefined}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: keyConfigured ? 'none' : '1px solid var(--line)',
            background: keyConfigured ? undefined : 'transparent',
            color: keyConfigured ? undefined : 'var(--text-faint)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: keyConfigured && !generating ? 'pointer' : 'default',
          }}
        >
          {generating ? 'Thinking…' : 'Plan my day'}
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
          {keyConfigured
            ? 'One call to Claude — roughly a nickel, and it takes about half a minute.'
            : 'Add an API key on the Week page first.'}
        </span>
      </div>
    </div>
  );
}

/**
 * A generation takes about twenty-five seconds. A bare spinner for that long reads as a hang,
 * so this says what is happening and roughly how long is left.
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

function PlanBody({ plan }: { plan: DayPlan }): React.JSX.Element {
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

      <div>
        {plan.blocks.map((block) => (
          <BlockRow key={block.id} block={block} localDate={plan.localDate} />
        ))}
      </div>

      {plan.deferred.length ? (
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
          {plan.deferred.map((line) => (
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
}: {
  block: PlanBlock;
  localDate: string;
}): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const [promoting, setPromoting] = useState(false);
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
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        padding: '7px 8px',
        borderRadius: 8,
        background: hover ? 'var(--surface-raised)' : 'transparent',
        transition: 'background var(--motion-fast) var(--ease-out)',
      }}
    >
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
        {block.start}–{block.end}
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
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{block.title}</div>
        {block.why ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>
            {block.why}
          </div>
        ) : null}
      </div>

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
  );
}

const KIND_COLOUR: Record<PlanBlock['kind'], string> = {
  focus: 'var(--amber)',
  break: 'var(--emerald)',
  admin: 'var(--slate)',
  meal: 'var(--lavender)',
  buffer: 'var(--line-strong)',
  wind_down: 'var(--lavender)',
};

const KIND_LABEL: Record<PlanBlock['kind'], string> = {
  focus: 'Focus',
  break: 'Break',
  admin: 'Admin',
  meal: 'Meal',
  buffer: 'Slack',
  wind_down: 'Wind down',
};

const ghostButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-faint)',
  fontSize: 11.5,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '2px 4px',
};
