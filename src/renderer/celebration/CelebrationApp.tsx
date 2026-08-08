import { useEffect, useState } from 'react';
import type { CelebrationCue } from '@shared/ipc/channels.js';
import { findPack } from './registry.js';

/**
 * The overlay's own click-through and 6s hard cap live in main; this side just renders and
 * tells main when it finished early so the overlay can hide before the cap fires.
 */
export function CelebrationApp(): React.JSX.Element {
  const [cue, setCue] = useState<CelebrationCue | null>(null);

  useEffect(() => {
    const offPlay = window.thread.on('celebration:play', setCue);
    const offStop = window.thread.on('celebration:stop', () => setCue(null));
    return () => {
      offPlay();
      offStop();
    };
  }, []);

  if (!cue) return <div style={{ width: '100vw', height: '100vh' }} />;

  const pack = findPack(cue.packId);
  if (!pack) return <div style={{ width: '100vw', height: '100vh' }} />;

  const done = (): void => {
    setCue(null);
    void window.thread.invoke['celebration:done'](undefined);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <pack.Component payload={cue.payload} onDone={done} />
    </div>
  );
}
