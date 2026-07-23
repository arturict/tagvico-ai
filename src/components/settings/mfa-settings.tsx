'use client';

import { useState } from 'react';
import { InlineStatus } from './inline-status';

type Status = {
  kind: 'neutral' | 'loading' | 'success' | 'error';
  message: string;
} | null;

async function request(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

export function MfaSettings() {
  const [secret, setSecret] = useState('');
  const [provisioningUri, setProvisioningUri] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setStatus({ kind: 'loading', message: 'Creating a time-limited setup secret…' });
    try {
      const payload = await request('/api/mfa/setup');
      setSecret(String(payload.secret || ''));
      setProvisioningUri(String(payload.provisioningUri || ''));
      setOtp('');
      setStatus({ kind: 'neutral', message: 'Add the secret to your authenticator, then verify one six-digit code.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not start MFA setup.'
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setStatus({ kind: 'loading', message: 'Verifying authenticator code…' });
    try {
      await request('/api/mfa/verify', { otp });
      setSecret('');
      setProvisioningUri('');
      setOtp('');
      setStatus({ kind: 'success', message: 'Multi-factor authentication is enabled.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'The code was not accepted.'
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setStatus({ kind: 'loading', message: 'Disabling multi-factor authentication…' });
    try {
      await request('/api/mfa/disable', { password });
      setSecret('');
      setProvisioningUri('');
      setOtp('');
      setPassword('');
      setStatus({ kind: 'success', message: 'Multi-factor authentication is disabled.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'MFA could not be disabled.'
      });
    } finally {
      setBusy(false);
    }
  };

  return <div className="settings-mfa">
    <div className="settings-action-cluster">
      <button className="settings-button" type="button" disabled={busy} onClick={() => void start()}>{secret ? 'Create a new secret' : 'Set up MFA'}</button>
      {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : null}
    </div>
    {secret ? <div className="settings-secret-setup">
      <p>Authenticator secret</p>
      <code>{secret}</code>
      <details><summary>Provisioning URI</summary><code>{provisioningUri}</code></details>
      <div className="settings-inline-form">
        <input className="settings-input" inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={6} placeholder="123456" aria-label="Authenticator code" onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        <button className="settings-button" type="button" disabled={busy || otp.length !== 6} onClick={() => void verify()}>Verify and enable</button>
      </div>
    </div> : null}
    <details className="settings-danger-zone">
      <summary>Disable MFA</summary>
      <div className="settings-inline-form">
        <input className="settings-input" type="password" autoComplete="current-password" value={password} placeholder="Current password" aria-label="Current password" onChange={(event) => setPassword(event.target.value)} />
        <button className="settings-button is-danger" type="button" disabled={busy || !password} onClick={() => void disable()}>Disable MFA</button>
      </div>
    </details>
  </div>;
}
