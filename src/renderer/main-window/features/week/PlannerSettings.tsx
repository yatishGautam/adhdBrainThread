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
      subtitle="What a normal day looks like, and which model shapes it. Synced to your account, so plans built anywhere — including your phone — know all of it."
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

      <Field label="Context — always true">
        <textarea
          defaultValue={settings.plannerContext}
          placeholder="Anything the planner should always know: my morning meeting is at 9, I want to be up by 7, meds at 8, focus dies after lunch…"
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

      <PlannerAvailability />
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
 * Where the key is, which is: not here.
 *
 * There used to be a password field on this panel, and a keychain entry behind it. Both are
 * gone. The key lives on the server, because the phone cannot hold one safely and three clients
 * each holding their own means three keys to rotate and a bill nobody can total. What is left is
 * a line saying so — an absent field with no explanation reads as a feature that broke.
 */
function PlannerAvailability(): React.JSX.Element {
	const availability = usePlanStore((s) => s.state?.availability ?? null);

	return (
		<Field label="Where planning happens">
			<p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
				{availability?.signedIn
					? availability.serverReady
						? 'On your server, with its own API key. This app never sees the key, and the plan it generates syncs to every device you are signed in on — including your phone.'
						: 'Your account is signed in, but that server has no planning key configured, so the button will not work yet.'
					: 'On your server, with its own API key. Sign in from Settings to use it — and the plan then syncs to every device, including your phone.'}
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
