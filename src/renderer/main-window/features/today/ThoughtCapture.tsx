import { useState } from 'react';
import type { Day } from '@shared/domain.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Panel } from './Panel.js';
import { ThoughtList } from './ThoughtList.js';

/** Capture-only. One input, enter to commit, newest first. */
export function ThoughtCapture({ day, readOnly }: { day: Day | null; readOnly: boolean }): React.JSX.Element {
  const [text, setText] = useState('');

  const add = async (): Promise<void> => {
    const trimmed = text.trim();
    setText('');
    if (trimmed) await window.thread.invoke['thought:add']({ text: trimmed });
  };

  return (
    <Panel
      title="Thoughts"
      subtitle="Somewhere to dump a thought so it stops interrupting you."
      hint="Type anything that pops into your head mid-task. Later you can turn each one into a thread, a todo, or just delete it."
    >
      {!readOnly ? (
        <input
          value={text}
          placeholder="Type it here and press Enter…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--surface-raised)',
            fontSize: 13,
            marginBottom: 12,
          }}
        />
      ) : null}
      {!day || day.thoughts.length === 0 ? (
        <EmptyState title="Nothing captured." detail="This is a parking lot, not a to-do list." />
      ) : (
        <ThoughtList day={day} readOnly={readOnly} />
      )}
    </Panel>
  );
}
