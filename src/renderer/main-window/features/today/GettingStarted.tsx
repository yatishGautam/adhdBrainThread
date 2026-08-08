import { useUiStore } from '../../stores/uiStore.js';

/**
 * Shown only until the first thread exists. Four empty panels is a confusing first screen; this
 * replaces it with the one sentence of vocabulary the app needs you to know, and one button.
 */
export function GettingStarted(): React.JSX.Element {
  const setTab = useUiStore((s) => s.setTab);

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        padding: '28px 26px',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '0 0 8px' }}>
        Welcome — here&rsquo;s the whole idea
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px', maxWidth: '58ch' }}>
        A <strong style={{ color: 'var(--text)' }}>thread</strong> is one thing you&rsquo;re working on. It
        holds its own checklist, so you never have to remember where you left off.
      </p>

      <ol style={{ margin: '0 0 22px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Step n={1} title="Make a thread" detail="Anything you're working on — a bug, an errand, a chapter." />
        <Step n={2} title="Give it a first step" detail="Just the next physical action. That's what shows on the board." />
        <Step n={3} title="Press Focus" detail="A small timer floats above your other windows. Work until it stops." />
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => setTab('threads')}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--amber)',
            color: '#201203',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Make your first thread
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Nothing is tracked until you do — this page stays empty on purpose.
        </span>
      </div>
    </div>
  );
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }): React.JSX.Element {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        className="mono"
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--surface-raised)',
          color: 'var(--amber)',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span>
        <span style={{ fontSize: 13 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginTop: 1 }}>{detail}</span>
      </span>
    </li>
  );
}
