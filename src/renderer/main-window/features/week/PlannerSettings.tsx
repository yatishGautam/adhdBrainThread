import { useEffect, useState } from 'react';
import type { Settings } from '@shared/domain.js';
import { PLANNER_MODELS } from '@shared/constants.js';
import { Panel } from '../today/Panel.js';
import { usePlanStore, refreshPlannerState } from '../../stores/planStore.js';

/**
 * Everything the planner needs to know that is true most days, plus what it has cost.
 *
 * The spend line is not decoration. This is the only feature in the app that spends the user's
 * money, and a number they can see is the difference between a tool they trust and a meter they
 * are afraid of. It is summed from the stored plans, so it cannot drift from reality.
 */
export function PlannerSettings(): React.JSX.Element {
  const state = usePlanStore((s) => s.state);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void window.thread.invoke['settings:get'](undefined).then(setSettings);
    const off = window.thread.on('settings:changed', setSettings);
    return off;
  }, []);

  const patch = async (part: Partial<Settings>): Promise<void> => {
    const next = await window.thread.invoke['settings:update']({ patch: part });
    setSettings(next);
    await refreshPlannerState();
  };

  if (!settings) return <div />;

  return (
    <Panel
      title="Planner"
      accent="var(--lavender)"
      subtitle="What a normal day looks like, and which model shapes it. Both are overridable each morning."
      right={state ? <Spend /> : null}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TimeField
          label="Wake"
          value={settings.wakeTime}
          onChange={(wakeTime) => void patch({ wakeTime })}
        />
        <TimeField
          label="Work from"
          value={settings.dayStartTime}
          onChange={(dayStartTime) => void patch({ dayStartTime })}
        />
        <TimeField
          label="Done by"
          value={settings.dayEndTime}
          onChange={(dayEndTime) => void patch({ dayEndTime })}
        />
      </div>

      <Field label="Always true">
        <textarea
          defaultValue={settings.plannerContext}
          placeholder="Standing meetings, medication timing, when your focus is best or worst, anything that shapes every day."
          onBlur={(e) => {
            if (e.target.value !== settings.plannerContext) {
              void patch({ plannerContext: e.target.value });
            }
          }}
          style={{
            width: '100%',
            minHeight: 64,
            resize: 'vertical',
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
      </Field>

      <Field label="Model">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLANNER_MODELS.map((model) => {
            const active = settings.plannerModel === model.id;
            return (
              <button
                key={model.id}
                onClick={() => void patch({ plannerModel: model.id })}
                title={model.note}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: active ? 'var(--surface-raised)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {model.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10.5,
                    color: 'var(--text-faint)',
                    fontWeight: 400,
                  }}
                >
                  {model.note.split('·')[1]?.trim()}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <ApiKeyField />
    </Panel>
  );
}

function Spend(): React.JSX.Element | null {
  const state = usePlanStore((s) => s.state);
  if (!state) return null;
  const { spend } = state;

  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        ${spend.costUsd.toFixed(2)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
        this month · {spend.plans} plan{spend.plans === 1 ? '' : 's'}
      </div>
    </div>
  );
}

/**
 * The key. Written to, never read from — there is no channel that returns one, so the field is
 * always empty and shows only a hint of what is already stored.
 */
function ApiKeyField(): React.JSX.Element {
  const state = usePlanStore((s) => s.state);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = state?.key;

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await window.thread.invoke['planner:setKey']({ key: value });
      setValue('');
      await refreshPlannerState();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="API key">
      {key?.configured ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            {key.hint}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sourceLabel(key.source)}</span>
          <div style={{ flex: 1 }} />
          {key.source === 'stored' ? (
            <button
              onClick={() => {
                void window.thread.invoke['planner:clearKey'](undefined).then(refreshPlannerState);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-faint)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Forget it
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={value}
            placeholder="sk-ant-…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && value.trim() && void save()}
            style={{
              flex: 1,
              fontSize: 12.5,
              fontFamily: 'var(--font-mono)',
              background: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '7px 10px',
            }}
          />
          <button
            onClick={() => void save()}
            disabled={!value.trim() || busy}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: value.trim() ? 'var(--surface-raised)' : 'transparent',
              color: value.trim() ? 'var(--text)' : 'var(--text-faint)',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: value.trim() && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {error ? (
        <p style={{ fontSize: 11, color: 'var(--clay)', margin: '6px 0 0' }}>{error}</p>
      ) : null}

      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '6px 0 0', lineHeight: 1.5 }}>
        {key?.configured
          ? 'Encrypted in your keychain and never leaves this machine. Billed to your Anthropic API credits, which are separate from a Claude Pro subscription.'
          : 'From console.anthropic.com. Stored encrypted in your keychain — the app never sends it anywhere but Anthropic.'}
        {key?.configured && !key.canPersist
          ? ' No keyring available on this machine, so it is held for this session only.'
          : ''}
      </p>
    </Field>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-faint)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function TimeField({
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

function sourceLabel(source: string | null): string {
  if (source === 'stored') return 'from your keychain';
  if (source === 'env') return 'from ANTHROPIC_API_KEY';
  if (source === 'dotenv') return 'from .env';
  return '';
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}
