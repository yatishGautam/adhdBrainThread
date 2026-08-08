import { useEffect, useState } from 'react';
import type { SessionState, SessionTick } from '@shared/ipc/channels.js';
import { MiniRing } from './MiniRing.js';
import { ThreadLabel } from './ThreadLabel.js';
import { Countdown } from './Countdown.js';
import { ControlBar } from './ControlBar.js';
import { HudToast } from './HudToast.js';
import { SwitchPicker } from './SwitchPicker.js';
import { EmptyHud } from './EmptyHud.js';

/**
 * Layout: momentum ring · thread title (next action beneath, 11px muted) · time remaining ·
 * buttons. Deliberately still while a session runs — no pulsing, no breathing animation. All
 * motion is reserved for transitions: start, distraction, switch, end, complete.
 */
export function HudApp(): React.JSX.Element {
  const [state, setState] = useState<SessionState | null>(null);
  const [tick, setTick] = useState<SessionTick | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    window.thread.invoke['session:state'](undefined).then(setState);
    const offChanged = window.thread.on('session:changed', (next) => {
      setState(next);
      if (!next) setTick(null);
    });
    const offTick = window.thread.on('session:tick', setTick);
    const offToast = window.thread.on('hud:toast', ({ text }) => {
      setToast(text);
      setTimeout(() => setToast(null), 1500);
    });
    return () => {
      offChanged();
      offTick();
      offToast();
    };
  }, []);

  const remainingMs = tick?.remainingMs ?? state?.remainingMs ?? 0;
  const progress = tick?.progress ?? 0;
  const paused = state?.paused ?? false;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 12,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        opacity: paused ? 0.6 : 1,
        transition: 'opacity var(--motion-slow) var(--ease-out)',
        // The title bar area doubles as the drag handle.
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {!state ? (
        <EmptyHud />
      ) : switching ? (
        <SwitchPicker onDone={() => setSwitching(false)} />
      ) : (
        <>
          <MiniRing progress={progress} paused={paused} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <ThreadLabel title={state.threadTitle} nextAction={state.nextAction} />
            <Countdown remainingMs={remainingMs} />
          </div>
          <ControlBar
            paused={paused}
            onPauseResume={() =>
              void window.thread.invoke[paused ? 'session:resume' : 'session:pause'](undefined)
            }
            onDistraction={(kind, note) => void window.thread.invoke['session:distraction']({ kind, note })}
            onSwitch={() => setSwitching(true)}
            onEnd={() => void window.thread.invoke['session:end']({})}
          />
        </>
      )}
      <HudToast text={toast} />
    </div>
  );
}
