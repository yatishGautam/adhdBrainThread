import { useState } from 'react';
import { formatClock } from '@shared/format.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useLiveClock } from '../../../shared/hooks/useLiveClock.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Button } from '../../../shared/components/Button.js';
import { Ring } from '../../../shared/components/Ring.js';
import { ThreadPicker } from './ThreadPicker.js';
import { Panel } from './Panel.js';

/** The currently running thread — mirrors HUD state live via the same session store. */
export function NowPanel({ readOnly }: { readOnly: boolean }): React.JSX.Element {
  const state = useSessionStore((s) => s.state);
  const tick = useLiveClock(state?.session.id ?? null);
  const [picking, setPicking] = useState(false);
  const remaining = tick?.remainingMs ?? state?.remainingMs ?? 0;

  return (
    <Panel
      title="Now"
      subtitle={state ? undefined : 'The one thing you are working on right now.'}
    >
      {!state ? (
        readOnly ? (
          <EmptyState title="Nothing was running." />
        ) : picking ? (
          <ThreadPicker onPick={(id) => window.thread.invoke['session:start']({ threadId: id }).then(() => setPicking(false))} onCancel={() => setPicking(false)} />
        ) : (
          <EmptyState
            title="Nothing running."
            detail="Starting a timer is the whole point — even a few minutes counts."
            action={<Button variant="primary" onClick={() => setPicking(true)}>Pick something</Button>}
          />
        )
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring value={tick?.progress ?? 0} size={44} dim={state.paused}>
            <span className="mono" style={{ fontSize: 10 }}>
              {formatClock(remaining)}
            </span>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.threadTitle}
            </div>
            {state.nextAction ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{state.nextAction}</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="sm"
              onClick={() =>
                void window.thread.invoke[state.paused ? 'session:resume' : 'session:pause'](undefined)
              }
            >
              {state.paused ? 'Resume' : 'Pause'}
            </Button>
            <Button size="sm" onClick={() => void window.thread.invoke['hud:show'](undefined)}>
              Show HUD
            </Button>
            <Button
              size="sm"
              title="Got distracted? Tap this. It adds time back to your clock and costs you nothing."
              onClick={() => void window.thread.invoke['session:distraction']({})}
            >
              I got distracted
            </Button>
            <Button size="sm" title="Stop the timer. This does not finish the thread." onClick={() => void window.thread.invoke['session:end']({})}>
              Stop
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
