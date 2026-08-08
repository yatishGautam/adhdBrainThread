import { DistractionButton, hudBtn } from './DistractionButton.js';
import type { DistractionKind } from '@shared/domain.js';

export function ControlBar({
  paused,
  onPauseResume,
  onDistraction,
  onSwitch,
  onEnd,
}: {
  paused: boolean;
  onPauseResume: () => void;
  onDistraction: (kind: DistractionKind, note?: string) => void;
  onSwitch: () => void;
  onEnd: () => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button onClick={onPauseResume} style={hudBtn} title={paused ? 'Resume' : 'Pause'}>
        {paused ? '▶' : '❙❙'}
      </button>
      <DistractionButton onDistraction={onDistraction} />
      <button onClick={onSwitch} style={hudBtn} title="Switch">
        ⇄
      </button>
      <button onClick={onEnd} style={hudBtn} title="End">
        ■
      </button>
    </div>
  );
}
