import { useRef, useState } from 'react';
import type { DistractionKind } from '@shared/domain.js';
import { hudBtn } from './ControlBar.js';

/**
 * One tap, no dialog — logs 'unspecified' and costs nothing. Long-press (600ms) opens a small
 * popover to tag internal/external and add a note; never required.
 *
 * Labelled "Distracted" rather than an icon: this is the button the whole honesty loop depends
 * on, so it must never be the one people are unsure about pressing.
 */
export function DistractionButton({
  onDistraction,
}: {
  onDistraction: (kind: DistractionKind, note?: string) => void;
}): React.JSX.Element {
  const [popover, setPopover] = useState(false);
  const [note, setNote] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = (): void => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPopover(true);
    }, 600);
  };
  const endPress = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (!longPressed.current && !popover) onDistraction('unspecified');
  };

  const tag = (kind: DistractionKind): void => {
    onDistraction(kind, note.trim() || undefined);
    setPopover(false);
    setNote('');
  };

  return (
    <div style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={() => timer.current && clearTimeout(timer.current)}
        style={{ ...hudBtn, color: 'var(--amber)' }}
        title="Tap when your attention drifts — it adds time back and costs you nothing. Hold to add detail."
      >
        Distracted
      </button>
      {popover ? (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 6,
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 8,
            width: 170,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 5 }}>
            What pulled you away?
          </div>
          <input
            autoFocus
            value={note}
            placeholder="Note (optional)"
            onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', fontSize: 11, marginBottom: 6, borderBottom: '1px solid var(--line)' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => tag('internal')} style={tagBtn} title="A thought, an urge, your own head">
              My head
            </button>
            <button onClick={() => tag('external')} style={tagBtn} title="A person, a ping, the world">
              Outside
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const tagBtn: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  padding: '4px 0',
  borderRadius: 6,
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
};
