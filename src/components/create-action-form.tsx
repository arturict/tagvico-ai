'use client';
import { useState } from 'react';

export function CreateActionForm({ members }: { members: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!open) return <div className="toolbar"><button className="button primary" onClick={() => setOpen(true)}>New action</button></div>;
  return <section className="panel" style={{ marginBottom: 18 }}><form className="form-grid" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try { const response = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paperlessDocumentId: Number(data.get('documentId')), title: data.get('title'), summary: data.get('summary'), dueAt: data.get('dueAt') || null, priority: data.get('priority'), assigneeMemberId: data.get('assignee') || null }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Could not create action'); window.location.reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create action'); setBusy(false); }
  }}>
    <label>Paperless document ID<input className="field" name="documentId" type="number" min="1" required /></label>
    <label>Title<input className="field" name="title" maxLength={240} required /></label>
    <label className="wide">Summary<textarea className="field" name="summary" rows={2} /></label>
    <label>Due date<input className="field" name="dueAt" type="date" /></label>
    <label>Priority<select className="field" name="priority" defaultValue="normal"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label>
    <label>Assignee<select className="field" name="assignee"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    <div className="wide toolbar">{error && <span className="error">{error}</span>}<button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create & sync'}</button><button className="button" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form></section>;
}
