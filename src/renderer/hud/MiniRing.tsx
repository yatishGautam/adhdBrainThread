import { Ring } from '../shared/components/Ring.js';

/** 20px, per the design system's three fixed sizes for the momentum ring. */
export function MiniRing({ progress, paused }: { progress: number; paused: boolean }): React.JSX.Element {
  return (
    <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <Ring value={progress} size={20} strokeWidth={2.5} dim={paused} />
    </div>
  );
}
