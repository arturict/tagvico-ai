'use client';
import { useState } from 'react';

export function LoginForm({ firstRun = false }: { firstRun?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <>{firstRun ? <div className="alert" role="status">
    <p className="alert-title">Setup is complete</p>
    <p>Sign in with the owner account to ask your first question.</p>
  </div> : null}<form className="auth-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Login failed'); window.location.assign(firstRun ? '/companion?welcome=1' : '/companion'); }
    catch (cause) { setError(cause instanceof TypeError ? 'Tagvico could not be reached. Check your connection and try again.' : cause instanceof Error ? cause.message : 'Login failed'); setBusy(false); }
  }}>
    <label className="auth-field"><span className="field-label">Username</span><input className="input input-40" name="username" autoComplete="username" required /></label>
    <label className="auth-field"><span className="field-label">Password</span><input className="input input-40" type="password" name="password" autoComplete="current-password" required /></label>
    <label className="auth-field"><span className="field-label">Two-factor code <small>(if enabled)</small></span><input className="input input-40" name="otp" inputMode="numeric" autoComplete="one-time-code" /></label>
    {error && <div className="field-error" role="alert">{error}</div>}
    <button className="btn btn-primary btn-40 btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form></>;
}
