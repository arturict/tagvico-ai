'use client';
import { useState } from 'react';

export function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Login failed'); window.location.assign('/actions'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Login failed'); setBusy(false); }
  }}>
    <label>Username<input className="field" name="username" autoComplete="username" required /></label>
    <label>Password<input className="field" type="password" name="password" autoComplete="current-password" required /></label>
    <label>Two-factor code <span className="muted">(if enabled)</span><input className="field" name="otp" inputMode="numeric" autoComplete="one-time-code" /></label>
    {error && <div className="error" role="alert">{error}</div>}
    <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>;
}
