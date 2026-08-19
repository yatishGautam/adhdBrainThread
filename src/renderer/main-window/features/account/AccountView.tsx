import { useEffect, useRef, useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@shared/auth.js';
import { runAuth, useAuthStore } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { SyncPanel } from './SyncPanel.js';
import { ServerStatus } from './ServerStatus.js';

type Mode = 'signin' | 'create';

/**
 * Signing in, as a page.
 *
 * It is a page and not a dialog because signing in is a thing you sit down and do — but it is
 * still never the first thing you see. The app is completely usable signed out, so this is
 * reached by choosing it, and leaving it costs one click.
 */
export function AccountView(): React.JSX.Element {
  const account = useAuthStore((s) => s.account);
  const setTab = useUiStore((s) => s.setTab);
  const prevTab = useUiStore((s) => s.prevTab);

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '36px 24px 48px' }}>
      <button
        onClick={() => setTab(prevTab === 'account' ? 'threads' : prevTab)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-faint)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'inherit',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 24,
        }}
      >
        ← Back
      </button>

      {account ? <SignedIn /> : <SignedOut />}

      {/*
        Last on the page, and outside the signed-in branch on purpose: whether the backend is up
        is a question about the server, not about you, and the person most likely to be asking it
        is the one who cannot sign in.
      */}
      <ServerStatus />
    </div>
  );
}

// ------------------------------------------------------------------ signed out

function SignedOut(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), [mode]);

  const tooShort = mode === 'create' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !tooShort && !busy;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    const ok = await runAuth(() =>
      mode === 'create'
        ? window.thread.invoke['auth:register']({ email, password, displayName })
        : window.thread.invoke['auth:login']({ email, password }),
    );
    if (ok) setPassword('');
  };

  const switchTo = (next: Mode): void => {
    setMode(next);
    setError(null);
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--text-xxl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
        {mode === 'create' ? 'Create your account' : 'Welcome back'}
      </h1>
      <p style={{ margin: '0 0 28px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
        {mode === 'create'
          ? 'One account keeps this Mac and your phone looking at the same threads, days and sits.'
          : 'Sign in and this Mac picks up whatever your phone has been writing.'}
      </p>

      <Segmented mode={mode} onChange={switchTo} />

      {mode === 'create' ? (
        <Field label="Your name" hint="What the app calls you. You can leave it blank.">
          <input
            ref={mode === 'create' ? first : undefined}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            placeholder="Yatish"
            style={inputStyle}
          />
        </Field>
      ) : null}

      <Field label="Email">
        <input
          ref={mode === 'signin' ? first : undefined}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          spellCheck={false}
          placeholder="you@example.com"
          style={inputStyle}
        />
      </Field>

      <Field
        label="Password"
        hint={
          mode === 'create'
            ? `At least ${MIN_PASSWORD_LENGTH} characters. A short phrase you can actually recall beats a clever word you can't.`
            : undefined
        }
        hintTone={tooShort ? 'warn' : 'muted'}
      >
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          style={inputStyle}
        />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <button type="submit" disabled={!canSubmit} className="btn-launch" style={primaryStyle(canSubmit)}>
        {busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
      </button>

      <p style={{ margin: '18px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.6 }}>
        You stay signed in until you sign out — closing the app does not log you out.
      </p>

      <ServerField />
    </form>
  );
}

/** Sign in / Create account as one control, so both are visibly available from either state. */
function Segmented({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }): React.JSX.Element {
  const options: { id: Mode; label: string }[] = [
    { id: 'signin', label: 'Sign in' },
    { id: 'create', label: 'Create account' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        marginBottom: 22,
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
      }}
    >
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 999,
              border: 'none',
              background: active ? 'var(--surface-raised)' : 'transparent',
              boxShadow: active ? 'var(--shadow-card)' : 'none',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              transition: 'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------- signed in

function SignedIn(): React.JSX.Element {
  const account = useAuthStore((s) => s.account);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const offline = useAuthStore((s) => s.offline);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  if (!account) return <></>;

  const name = account.displayName?.trim();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <Avatar label={name || account.email} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
            {name || account.email}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            {name ? `${account.email} · ` : ''}
            {hostOf(serverUrl)}
            {offline ? ' · offline right now' : ''}
          </p>
        </div>
      </div>

      <SyncPanel />

      {error ? <ErrorNote message={error} /> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void runAuth(() => window.thread.invoke['auth:logout'](undefined))}
        style={{ ...secondaryStyle, marginTop: 20 }}
      >
        Sign out
      </button>

      {confirmingDelete ? (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            This deletes the account and everything stored under it on the server, permanently.
            What is on this Mac stays where it is.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setConfirmingDelete(false)} style={secondaryStyle}>
              Keep it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAuth(() => window.thread.invoke['auth:deleteAccount'](undefined))}
              style={{ ...secondaryStyle, borderColor: 'var(--coral)', color: 'var(--coral)' }}
            >
              Delete permanently
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          style={{ ...linkStyle, color: 'var(--text-faint)', marginTop: 18 }}
        >
          Delete this account
        </button>
      )}
    </div>
  );
}

export function Avatar({ label, size = 44 }: { label: string; size?: number }): React.JSX.Element {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: 'var(--grad-ember)',
        color: '#241103',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
      }}
    >
      {initials(label)}
    </div>
  );
}

/**
 * Which server to talk to. Tucked away because almost nobody needs it — but without it there is
 * no way to point a dev build at a local backend, and no way to move if the host ever changes.
 */
function ServerField(): React.JSX.Element {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState(serverUrl);

  useEffect(() => setDraft(serverUrl), [serverUrl]);

  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} style={{ ...linkStyle, color: 'var(--text-faint)' }}>
        Server: {hostOf(serverUrl)}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <Field label="Server">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} style={inputStyle} />
      </Field>
      <button
        type="button"
        onClick={() => {
          void runAuth(() => window.thread.invoke['auth:setServer']({ url: draft }));
          setShown(false);
        }}
        style={secondaryStyle}
      >
        Use this server
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  hintTone = 'muted',
  children,
}: {
  label: string;
  hint?: string;
  hintTone?: 'muted' | 'warn';
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 'var(--text-xs)',
            color: hintTone === 'warn' ? 'var(--coral)' : 'var(--text-faint)',
            lineHeight: 1.5,
          }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function ErrorNote({ message }: { message: string }): React.JSX.Element {
  return (
    <p
      role="alert"
      style={{
        margin: '0 0 16px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(224, 108, 90, 0.12)',
        border: '1px solid rgba(224, 108, 90, 0.35)',
        fontSize: 'var(--text-xs)',
        color: 'var(--coral)',
        lineHeight: 1.55,
      }}
    >
      {message}
    </p>
  );
}

export function initials(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  outline: 'none',
};

function primaryStyle(enabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  };
}

const secondaryStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 14,
  padding: 0,
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'center',
};
