import { useState } from 'react';
import type { Day } from '@shared/domain.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { Panel } from './Panel.js';
import { ThoughtList } from './ThoughtList.js';

/**
 * Park (§3): a rapid-capture inbox for stray thoughts and distractions. One input, Enter to
 * commit, newest first. Stays per-day on purpose — it is a scratch inbox, not a commitment, and
 * carrying it forward would turn yesterday's noise into today's backlog.
 *
 * The HUD's Park button writes into this same list.
 */
export function ThoughtCapture({ day, localDate }: { day: Day | null; localDate: string }): React.JSX.Element {
  const [text, setText] = useState('');

  const add = async (): Promise<void> => {
    const trimmed = text.trim();
    setText('');
    if (trimmed) await window.thread.invoke['thought:add']({ text: trimmed, localDate });
  };

  return (
    <Panel
      title="Park"
      accent="var(--slate)"
      subtitle="Somewhere to dump a thought so it stops interrupting you."
      hint="Type anything that pops into your head mid-task. Later you can turn each one into a thread, a to-do, or just delete it."
    >
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
      {!day || day.thoughts.length === 0 ? (
        <EmptyState title="Nothing parked." detail="This is a parking lot, not a to-do list." />
      ) : (
        <ThoughtList day={day} readOnly={false} />
      )}
    </Panel>
  );
}
