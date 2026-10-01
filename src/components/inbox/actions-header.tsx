'use client';

import { useState } from 'react';

type Member = { id: string; name: string };

/** Page title of the actions list with the "New action" button; opening it shows the form under the title. */
export function ActionsHeader({ members, canCreate }: { members: Member[]; canCreate: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (form: HTMLFormElement) => {
    setBusy(true);
    setError('');
    const data = new FormData(form);
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperlessDocumentId: Number(data.get('documentId')),
          title: data.get('title'),
          summary: data.get('summary'),
          dueAt: data.get('dueAt') || null,
          priority: data.get('priority'),
          assigneeMemberId: data.get('assignee') || null
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create action');
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create action');
      setBusy(false);
    }
  };

  return <>
    <header className="page-header">
      <h1 className="page-title">Actions</h1>
      {canCreate && !open ? <div className="page-actions"><button type="button" className="btn btn-secondary btn-32" onClick={() => setOpen(true)}>New action</button></div> : null}
    </header>
    {open ? <form className="card new-action" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
      <label className="new-action-field">
        <span className="field-label">Paperless document ID</span>
        <input className="input" name="documentId" type="number" min="1" required />
      </label>
      <label className="new-action-field">
        <span className="field-label">Title</span>
        <input className="input" name="title" maxLength={240} required />
      </label>
      <label className="new-action-field is-wide">
        <span className="field-label">Summary</span>
        <textarea className="textarea" name="summary" rows={2} />
      </label>
      <label className="new-action-field">
        <span className="field-label">Due date</span>
        <input className="input" name="dueAt" type="date" />
      </label>
      <label className="new-action-field">
        <span className="field-label">Priority</span>
        <select className="select" name="priority" defaultValue="normal">
          <option>low</option>
          <option>normal</option>
          <option>high</option>
          <option>urgent</option>
        </select>
      </label>
      <label className="new-action-field">
        <span className="field-label">Assignee</span>
        <select className="select" name="assignee">
          <option value="">Unassigned</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      <div className="new-action-footer">
        {error ? <span className="field-error" role="alert">{error}</span> : null}
        <button type="button" className="btn btn-ghost btn-32" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-32" disabled={busy}>{busy ? 'Creating…' : 'Create and sync'}</button>
      </div>
    </form> : null}
  </>;
}
