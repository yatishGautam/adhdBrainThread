import { Ring } from '../shared/components/Ring.js';
import { urgencyColor, type Urgency } from './urgency.js';

/** 20px, per the design system's three fixed sizes for the momentum ring. */
export function MiniRing({
  progress,
  paused,
  urgency,
}: {
  progress: number;
  paused: boolean;
  urgency: Urgency;
}): React.JSX.Element {
  return (
    <div style={{ WebkitAppRegion: 'no-drag', flexShrink: 0 } as React.CSSProperties}>
      <Ring
        value={progress}
        size={22}
        strokeWidth={2.5}
        dim={paused}
        color={urgencyColor(urgency)}
        pulse={!paused && urgency === 'urgent'}
      />
    </div>
  );
}
