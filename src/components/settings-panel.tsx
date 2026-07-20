'use client';

import { FormEvent, useState } from 'react';

type Member = {
  id: string;
  display_name: string;
  role: string;
  paperless_user_id?: number;
  paperless_configured?: boolean | number;
};

type Props = {
  householdId: string;
  currentMemberId: string;
  currentRole: string;
  householdKind: string;
  runtime: { provider: string; model: string };
  codexStatus: { authenticated: boolean; model: string };
  members: Member[];
};

export function SettingsPanel({ householdId, currentMemberId, currentRole, householdKind, runtime, codexStatus, members }: Props) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loginId, setLoginId] = useState('');
  const [loginOutput, setLoginOutput] = useState('');

  const json = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  };

  const poll = (id: string) => {
    const deadline = Date.now() + 5 * 60 * 1000;
    const timer = window.setInterval(async () => {
      if (Date.now() >= deadline) {
        clearInterval(timer);
        setError('Codex sign-in timed out. Start a new device sign-in.');
        return;
      }
      try {
        const state = await json(`/api/codex/login/${id}`);
        setLoginOutput(state.output || state.error || 'Waiting for sign-in…');
        if (state.completed) {
          clearInterval(timer);
          setNotice(state.error ? '' : 'Codex login completed.');
          if (state.error) setError(state.error);
        }
      } catch (cause) {
        clearInterval(timer);
        setError(cause instanceof Error ? cause.message : 'Could not check Codex sign-in');
      }
    }, 1200);
  };

  const saveAccess = async (event: FormEvent<HTMLFormElement>, memberId: string) => {
    event.preventDefault(); setError(''); setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await json(`/api/household/members/${memberId}/paperless`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: data.get('token'),
          removeToken: data.get('removeToken') === 'on',
          paperlessUserId: data.get('paperlessUserId') ? Number(data.get('paperlessUserId')) : undefined
        })
      });
      setNotice('Paperless access saved.');
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Paperless access');
    }
  };

  const managedMembers = currentRole === 'owner' ? members : members.filter((member) => member.id === currentMemberId);

  return <div className="detail-grid">
    <section className="panel">
      <h2>Household profiles</h2>
      <p className="muted">{householdKind === 'solo' ? 'Solo workspace. Add a managed profile to upgrade it to a family household.' : 'Family household'}</p>
      <p className="muted">Profiles control assignments, Paperless permissions and optional Telegram access. They are not separate web sign-in accounts.</p>
      <p className="muted" style={{ fontSize: 12 }}>Telegram mapping: householdId <code>{householdId}</code></p>
      <div className="steps">{members.map((member) => <div className="step" key={member.id}>
        <span className="brand-mark" style={{ width: 27, height: 27 }}>{member.display_name.slice(0, 1).toUpperCase()}</span>
        <span style={{ flex: 1 }}>{member.display_name}<small className="muted" style={{ display: 'block' }}>memberId {member.id} · Paperless {member.paperless_configured ? 'configured' : 'not configured'}</small></span>
        <span className="pill">{member.role}</span>
      </div>)}</div>

      {currentRole === 'owner' ? <form className="form-grid" style={{ marginTop: 18 }} onSubmit={async (event) => {
        event.preventDefault(); setError('');
        const data = new FormData(event.currentTarget);
        try {
          await json('/api/household/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) });
          window.location.reload();
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>
        <label>Name<input className="field" name="displayName" maxLength={100} required /></label>
        <label>Role<select className="field" name="role"><option>adult</option><option>member</option><option>viewer</option></select></label>
        <button className="button wide">Add managed profile</button>
      </form> : <p className="muted" style={{ marginTop: 18 }}>Only the household owner can add managed profiles.</p>}

      <h2 style={{ marginTop: 30 }}>Paperless access</h2>
      <p className="muted">Each profile uses its own encrypted token, so Paperless remains the permission authority. Only the owner may manage another profile.</p>
      {managedMembers.map((member) => <form className="form-grid" key={member.id} onSubmit={(event) => void saveAccess(event, member.id)}>
        <h3 className="wide">{member.display_name} <span className="pill">{member.role}</span></h3>
        <label className="wide">API token<input className="field" name="token" type="password" autoComplete="off" placeholder={member.paperless_configured ? 'Configured — enter a value only to replace it' : 'Paperless API token'} /></label>
        <label>Paperless user ID<input className="field" name="paperlessUserId" type="number" min="1" defaultValue={member.paperless_user_id || ''} /></label>
        <label style={{ alignSelf: 'end' }}><input name="removeToken" type="checkbox" /> Remove saved token</label>
        <button className="button">Save access</button>
      </form>)}
    </section>

    <aside className="panel">
      <h2>Companion runtime</h2>
      <p><span className="pill suggested">{runtime.provider}</span></p><p>{runtime.model}</p>
      <p className="muted">OpenCode Go and other OpenAI-compatible services run through Vercel AI SDK v6. Codex is an optional read-only model adapter.</p>
      <p><a className="button" href="/automation/settings">Open automation settings</a></p>
      <hr style={{ borderColor: 'var(--line)', margin: '24px 0' }} />
      <h2>ChatGPT / Codex</h2>
      <p className={codexStatus.authenticated ? 'success' : 'muted'}>{codexStatus.authenticated ? 'Signed in' : 'Not signed in'} · {codexStatus.model}</p>
      <button className="button" disabled={!!loginId} onClick={async () => {
        setError(''); setNotice('');
        try { const state = await json('/api/codex/login', { method: 'POST' }); setLoginId(state.loginId); setLoginOutput(state.output || 'Starting secure device sign-in…'); poll(state.loginId); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>Start device sign-in</button>
      {loginId && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--tv-muted)' }}>{loginOutput}</pre>}
      <form action="/api/auth/logout" method="post" style={{ marginTop: 30 }}><button className="button danger">Sign out of Tagvico</button></form>
    </aside>
    {(error || notice) && <div className={error ? 'error' : 'success'}>{error || notice}</div>}
  </div>;
}
