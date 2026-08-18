import { useEffect, useRef, useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@shared/auth.js';
import { runAuth, useAuthStore } from '../../stores/authStore.js';

type Mode = 'signin' | 'create';

/**
 * The account, as a dialog rather than a tab or a wall in front of the app.
 *
 * An account is optional here and always will be: the app is fully usable signed out, so the
 * one thing this must never become is a launch screen. You open it when you want to, and
 * closing it costs nothing.
 */
export function AccountPanel(): React.JSX.Element | null {
  const open = useAuthStore((s) => s.panelOpen);
  const close = useAuthStore((s) => s.setPanelOpen);
  const account = useAuthStore((s) => s.account);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      onClick={() => close(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,17,21,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card)',
          padding: 24,
          width: 380,
          maxWidth: '90vw',
        }}
      >
        {account ? <SignedIn /> : <SignedOut />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ signed out

function SignedOut(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const emailField = useRef<HTMLInputElement>(null);

  useEffect(() => emailField.current?.focus(), []);

  const tooShort = mode === 'create' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !tooShort && !busy;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    const ok = await runAuth(() =>
      mode === 'create'
        ? window.thread.invoke['auth:register']({ email, password })
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
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
        {mode === 'create' ? 'Create an account' : 'Sign in'}
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Everything already works without one. An account is what lets the same threads and days
        show up on your phone.
      </p>

      <Field label="Email">
        <input
          ref={emailField}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          spellCheck={false}
          style={inputStyle}
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          style={inputStyle}
        />
      </Field>

      {mode === 'create' ? (
        <p
          style={{
            margin: '-6px 0 12px',
            fontSize: 'var(--text-xs)',
            color: tooShort ? 'var(--coral)' : 'var(--text-faint)',
          }}
        >
          At least {MIN_PASSWORD_LENGTH} characters. A short phrase you can actually recall beats
          a clever word you can&rsquo;t.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          style={{
            margin: '0 0 12px',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(224, 108, 90, 0.12)',
            border: '1px solid rgba(224, 108, 90, 0.35)',
            fontSize: 'var(--text-xs)',
            color: 'var(--coral)',
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={!canSubmit} className="btn-launch" style={primaryStyle(canSubmit)}>
        {busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
      </button>

      <button
        type="button"
        onClick={() => switchTo(mode === 'create' ? 'signin' : 'create')}
        style={linkStyle}
      >
        {mode === 'create' ? 'I already have an account' : 'Create an account instead'}
      </button>

      <ServerField />
    </form>
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

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--text-lg)', fontWeight: 600 }}>Account</h2>
      <p style={{ margin: '0 0 2px', fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{account.email}</p>
      <p style={{ margin: '0 0 18px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
        {hostOf(serverUrl)}
        {offline ? ' · offline right now, still signed in' : ''}
      </p>

      <p
        style={{
          margin: '0 0 18px',
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
        }}
      >
        Your threads, days and sessions still live on this Mac and nowhere else. Uploading them to
        this account is the next piece of work — the account itself is ready for it.
      </p>

      {error ? (
        <p role="alert" style={{ margin: '0 0 12px', fontSize: 'var(--text-xs)', color: 'var(--coral)' }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void runAuth(() => window.thread.invoke['auth:logout'](undefined))}
        style={secondaryStyle}
      >
        Sign out
      </button>

      {confirmingDelete ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            This deletes the account and everything stored under it on the server, permanently.
            What is on this Mac stays.
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
        <button type="button" onClick={() => setConfirmingDelete(true)} style={{ ...linkStyle, color: 'var(--text-faint)' }}>
          Delete this account
        </button>
      )}
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
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <Field label="Server">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          style={inputStyle}
        />
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

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span
        style={{
          display: 'block',
          marginBottom: 5,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
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
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  };
}

const secondaryStyle: React.CSSProperties = {
  padding: '8px 14px',
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
  marginTop: 12,
  padding: 0,
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'center',
};
