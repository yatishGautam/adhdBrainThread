import { useState } from 'react';
import type { ServerHealth } from '@shared/ipc/channels.js';
import { readableError, useAuthStore } from '../../stores/authStore.js';
import { hostOf } from './AccountView.js';

/**
 * Is the server up? One button, one light.
 *
 * It checks when pressed and at no other time. A light that polls on its own would be a
 * background request every few seconds for a question nobody asked, and — worse — it would go
 * red on the train and tell someone whose work is already safely on this Mac that something is
 * broken. Pressing it is a deliberate question, so the answer is worth showing plainly.
 *
 * The colour is never the only signal: the headline says the same thing in words, for anyone
 * who cannot pick green out of red or is reading this through a screen reader.
 *
 * **What a green light proves, exactly:** the host answered. `/health` is a liveness probe and
 * touches no database — verified by watching it return 200 with Postgres stopped — so "Online"
 * means the server is reachable, not that a sync would succeed. That is deliberately the useful
 * question: this exists to separate "my wifi is down" from "the server is down", and the wording
 * stays inside what it can actually show. It never says "working", and the detail line reports
 * only that the host answered and how fast.
 */
type Probe =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; health: ServerHealth };

export function ServerStatus(): React.JSX.Element {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const [probe, setProbe] = useState<Probe>({ phase: 'idle' });

  const check = async (): Promise<void> => {
    setProbe({ phase: 'checking' });
    try {
      const health = await window.thread.invoke['server:health'](undefined);
      setProbe({ phase: 'done', health });
    } catch (error: unknown) {
      // The handler answers rather than rejects, so reaching here means IPC itself broke.
      setProbe({
        phase: 'done',
        health: { online: false, host: hostOf(serverUrl), latencyMs: null, message: readableError(error) },
      });
    }
  };

  const checking = probe.phase === 'checking';

  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }} role="status" aria-live="polite">
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            <Light probe={probe} />
            {headline(probe)}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {detail(probe, serverUrl)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          style={{
            flexShrink: 0,
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--line)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'inherit',
            cursor: checking ? 'default' : 'pointer',
          }}
        >
          {checking ? 'Checking…' : 'Check'}
        </button>
      </div>
    </div>
  );
}

/**
 * The light itself. `calendarPulse` is borrowed from tokens.css rather than reinvented here —
 * it already means "this is live right now" everywhere else in the app, and it already stops
 * moving under prefers-reduced-motion.
 */
function Light({ probe }: { probe: Probe }): React.JSX.Element {
  const colour = colourOf(probe);
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: 8,
        height: 8,
        borderRadius: 999,
        background: colour,
        boxShadow: probe.phase === 'done' && probe.health.online ? `0 0 8px ${colour}` : 'none',
        animation: probe.phase === 'checking' ? 'calendarPulse 1.1s ease-in-out infinite' : 'none',
        transition: 'background var(--motion-fast) var(--ease-out)',
      }}
    />
  );
}

function colourOf(probe: Probe): string {
  if (probe.phase === 'checking') return 'var(--amber)';
  if (probe.phase === 'idle') return 'var(--line-strong)';
  return probe.health.online ? 'var(--emerald)' : 'var(--coral)';
}

function headline(probe: Probe): string {
  if (probe.phase === 'idle') return 'Server';
  if (probe.phase === 'checking') return 'Checking…';
  return probe.health.online ? 'Online' : 'Not answering';
}

function detail(probe: Probe, serverUrl: string): string {
  if (probe.phase !== 'done') return hostOf(serverUrl);
  const { host, latencyMs, online, message } = probe.health;
  if (!online) {
    // The message is already a sentence. Then the part that actually matters, which is that
    // none of this stops the app: every write landed on this Mac before the server heard of it.
    return `${message ?? `${host} is not answering.`} Nothing here depends on it.`;
  }
  return latencyMs === null ? `${host} answered.` : `${host} answered in ${took(latencyMs)}.`;
}

/**
 * `42 ms`, `1.2 s`. Milliseconds stop being readable somewhere around a thousand of them, and
 * the whole point of showing the number is that a green light which took three seconds should
 * not read like one that came back instantly.
 */
function took(latencyMs: number): string {
  return latencyMs < 1000 ? `${latencyMs} ms` : `${(latencyMs / 1000).toFixed(1)} s`;
}
