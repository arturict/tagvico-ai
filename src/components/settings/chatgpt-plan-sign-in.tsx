'use client';

import { useState } from 'react';
import { InlineStatus } from './inline-status';

const USAGE_URL = 'https://chatgpt.com/settings/usage';

type PendingLogin = { loginId: string; authorizeUrl: string };

export const MALFORMED_ADDRESS = 'Paste the full address from the browser tab ChatGPT sent you to.';

/**
 * Cheap shape check before the address leaves the browser. The server still
 * verifies the sign-in attempt itself; this only catches input that cannot be a
 * ChatGPT callback, such as text that is not an address or lacks the sign-in code.
 */
export function callbackAddressProblem(input: string): string | null {
  const value = input.trim();
  if (!value) return 'Paste the address of the page ChatGPT opened.';
  let params: URLSearchParams;
  if (/^https?:/i.test(value)) {
    try {
      params = new URL(value).searchParams;
    } catch {
      return MALFORMED_ADDRESS;
    }
  } else if (value.includes('=')) {
    params = new URLSearchParams(value.replace(/^[?#]/, ''));
  } else {
    return MALFORMED_ADDRESS;
  }
  if (!params.get('code') && !params.get('error')) return 'This address has no sign-in code. Copy the full address of the page ChatGPT opened.';
  if (!params.get('state')) return 'This address has no sign-in state. Copy the full address of the page ChatGPT opened.';
  return null;
}

/**
 * Sign in with ChatGPT for a server that the browser's 127.0.0.1 callback
 * cannot reach: ChatGPT sends the browser to a loopback address that does not
 * load, and the user pastes that address back here so Tagvico can finish.
 */
export function ChatGPTPlanSignIn({
  apiBase,
  authenticated,
  accountLabel,
  onConnected,
  onError,
  onLogout
}: {
  /** `/api/chatgpt` in Settings, `/api/setup/v3/chatgpt` during first-run setup. */
  apiBase: string;
  authenticated: boolean;
  accountLabel?: string;
  onConnected: () => void | Promise<void>;
  onError: (message: string) => void;
  onLogout?: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<PendingLogin | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const start = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/login`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.authorizeUrl) throw new Error(body.error || 'Could not start ChatGPT sign-in.');
      setPending({ loginId: body.loginId, authorizeUrl: body.authorizeUrl });
      setCallbackUrl('');
      setProblem('');
      window.open(body.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not start ChatGPT sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!pending) return;
    const shapeProblem = callbackAddressProblem(callbackUrl);
    if (shapeProblem) {
      setProblem(shapeProblem);
      return;
    }
    setProblem('');
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/login/${encodeURIComponent(pending.loginId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not finish ChatGPT sign-in.');
      if (!body.planUsage) throw new Error('Signed in, but ChatGPT plan usage was not allowed. Sign in again and allow Tagvico to use your plan.');
      setPending(null);
      setCallbackUrl('');
      await onConnected();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not finish ChatGPT sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const loginId = pending?.loginId;
    setPending(null);
    setCallbackUrl('');
    setProblem('');
    if (loginId) await fetch(`${apiBase}/login/${encodeURIComponent(loginId)}/cancel`, { method: 'POST' }).catch(() => undefined);
  };

  return <div className="set-auth">
    <div className="set-actions is-start">
      <InlineStatus kind={authenticated ? 'success' : 'neutral'}>
        {authenticated ? `Using ChatGPT plan${accountLabel ? ` · ${accountLabel}` : ''}` : 'Not connected'}
      </InlineStatus>
      {!pending ? <button
        className={`btn ${authenticated ? 'btn-secondary' : 'btn-primary'}`}
        type="button"
        disabled={busy}
        onClick={() => void start()}
      >
        {authenticated ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}
      </button> : null}
      {authenticated ? <a className="btn btn-secondary" href={USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a> : null}
      {authenticated && onLogout && !pending
        ? <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void onLogout()}>Sign out</button>
        : null}
    </div>
    {pending ? <div className="set-auth-pending">
      <ol className="set-steps">
        <li>Sign in on the ChatGPT tab (<a className="link" href={pending.authorizeUrl} target="_blank" rel="noreferrer">open it again</a>) and allow Tagvico to use your plan.</li>
        <li>ChatGPT then opens a page on 127.0.0.1 that does not load. That is expected.</li>
        <li>Copy the full address of that page and paste it here.</li>
      </ol>
      <label className="set-field is-stacked">
        <span className="set-field-copy">
          <span className="set-field-label">Address of the page ChatGPT opened</span>
        </span>
        <span className="set-field-control">
          <input
            className="input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="http://127.0.0.1:1455/auth/callback?code=…"
            value={callbackUrl}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => { setCallbackUrl(event.target.value); setProblem(''); }}
          />
          {problem ? <span className="set-field-error" role="alert">{problem}</span> : null}
        </span>
      </label>
      <div className="set-actions is-start">
        <button className="btn btn-primary" type="button" disabled={busy || !callbackUrl.trim()} onClick={() => void finish()}>
          {busy ? 'Connecting…' : 'Finish sign-in'}
        </button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void cancel()}>Cancel</button>
      </div>
    </div> : null}
    <p className="set-note">
      Plus and Pro plans only. Usage counts toward your plan, and document text is sent to OpenAI.
    </p>
  </div>;
}
