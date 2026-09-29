'use client';

import { useState } from 'react';
import { InlineStatus } from './inline-status';

const USAGE_URL = 'https://chatgpt.com/settings/usage';

type PendingLogin = { loginId: string; authorizeUrl: string };

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

  const start = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/login`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.authorizeUrl) throw new Error(body.error || 'Could not start ChatGPT sign-in.');
      setPending({ loginId: body.loginId, authorizeUrl: body.authorizeUrl });
      setCallbackUrl('');
      window.open(body.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not start ChatGPT sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!pending) return;
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
      onError(error instanceof Error ? error.message : 'Could not finish ChatGPT sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const loginId = pending?.loginId;
    setPending(null);
    setCallbackUrl('');
    if (loginId) await fetch(`${apiBase}/login/${encodeURIComponent(loginId)}/cancel`, { method: 'POST' }).catch(() => undefined);
  };

  return <div className="settings-auth-panel">
    <div className="settings-action-cluster">
      <InlineStatus kind={authenticated ? 'success' : 'neutral'}>
        {authenticated ? `Using ChatGPT plan${accountLabel ? ` · ${accountLabel}` : ''}` : 'Not connected'}
      </InlineStatus>
      {!pending ? <button className="settings-button" type="button" disabled={busy} onClick={() => void start()}>
        {authenticated ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}
      </button> : null}
      {authenticated ? <a className="settings-button" href={USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a> : null}
      {authenticated && onLogout && !pending
        ? <button className="settings-button is-danger" type="button" disabled={busy} onClick={() => void onLogout()}>Sign out</button>
        : null}
    </div>
    {pending ? <div className="settings-auth-panel">
      <ol className="settings-field-help">
        <li>Sign in on the ChatGPT tab (<a href={pending.authorizeUrl} target="_blank" rel="noreferrer">open it again</a>) and allow Tagvico to use your plan.</li>
        <li>ChatGPT then opens a page on 127.0.0.1 that does not load. That is expected.</li>
        <li>Copy the full address of that page and paste it here.</li>
      </ol>
      <label className="settings-field">
        <span className="settings-field-label">Address of the page ChatGPT opened</span>
        <input
          className="settings-input"
          type="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="http://127.0.0.1:1455/auth/callback?code=…"
          value={callbackUrl}
          onChange={(event) => setCallbackUrl(event.target.value)}
        />
      </label>
      <div className="settings-action-cluster">
        <button className="settings-button" type="button" disabled={busy || !callbackUrl.trim()} onClick={() => void finish()}>
          {busy ? 'Connecting…' : 'Finish sign-in'}
        </button>
        <button className="settings-button" type="button" disabled={busy} onClick={() => void cancel()}>Cancel</button>
      </div>
    </div> : null}
    <span className="settings-field-help">
      Plus and Pro plans only. Requests count toward your ChatGPT plan; you can set a limit for Tagvico under Manage usage. Document text is sent to OpenAI.
    </span>
  </div>;
}
