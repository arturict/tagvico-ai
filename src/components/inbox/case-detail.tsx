'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Circle, CircleCheck } from 'lucide-react';
import { caseFromRow } from './case-mapper';
import { dueChip, shortDate, shortDateTime } from './dates';
import type { InboxMember } from './types';
import { notifyNavigation, request } from './workboard';

type Step = { id: string; title: string; status: string; due_at: string | null };
type CaseEvent = { id: string; event_type: string; actor_member_id: string | null; created_at: string; payload: Record<string, unknown> };
export type CaseRecord = Record<string, unknown> & {
  id: string;
  title: string;
  summary: string;
  status: string;
  priority: string;
  dueAt: string | null;
  assigneeMemberId: string | null;
  paperlessDocumentId: number;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  steps: Step[];
  events: CaseEvent[];
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
  { value: 'dismissed', label: 'Dismissed' }
];
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];

function describeEvent(event: CaseEvent, names: Map<string, string>) {
  const payload = event.payload || {};
  switch (event.event_type) {
    case 'case.created': return `Created${payload.source === 'ai' ? ' by Tagvico' : ''}`;
    case 'case.updated': {
      const parts: string[] = [];
      if (payload.status !== undefined) parts.push(`status to ${String(payload.status)}`);
      if (payload.assigneeMemberId !== undefined) parts.push(payload.assigneeMemberId ? `assigned to ${names.get(String(payload.assigneeMemberId)) || 'a member'}` : 'unassigned');
      if (payload.dueAt !== undefined) parts.push(payload.dueAt ? `due date to ${shortDate(String(payload.dueAt))}` : 'due date cleared');
      if (payload.priority !== undefined) parts.push(`priority to ${String(payload.priority)}`);
      if (payload.title !== undefined) parts.push('title');
      if (payload.summary !== undefined) parts.push('summary');
      return parts.length ? `Changed ${parts.join(', ')}` : 'Updated';
    }
    case 'step.created': return `Added step “${String(payload.title || '')}”`;
    case 'step.updated': return payload.status ? `Marked a step ${String(payload.status)}` : 'Edited a step';
    case 'paperless.synced': return 'Pushed to Paperless';
    case 'paperless.sync_failed': return `Paperless sync failed: ${String(payload.error || 'unknown error')}`;
    case 'paperless.pulled': return Array.isArray(payload.changed) && payload.changed.length ? `Pulled ${payload.changed.map(String).join(', ')} from Paperless` : 'Checked Paperless, nothing changed';
    default: return event.event_type.replaceAll('.', ' ').replaceAll('_', ' ');
  }
}

type ActivityEntry = { id: string; text: string; who: string; at: string; count: number };

/** Events arrive newest first; a run of identical ones (a sync that keeps failing) reads as one line with a count. */
function collapseEvents(events: CaseEvent[], names: Map<string, string>) {
  const entries: ActivityEntry[] = [];
  for (const event of events) {
    const text = describeEvent(event, names);
    const who = event.actor_member_id ? names.get(event.actor_member_id) || 'Someone' : '';
    const last = entries[entries.length - 1];
    if (last && last.text === text && last.who === who) last.count += 1;
    else entries.push({ id: event.id, text, who, at: event.created_at, count: 1 });
  }
  return entries;
}

const SYNC_LABEL: Record<string, string> = { synced: 'In sync with Paperless', pending: 'Changes not pushed yet', error: 'Last sync failed', conflict: 'Paperless changed too' };

export function CaseDetail({ initial, members, today, canMutate }: { initial: CaseRecord; members: InboxMember[]; today: string; canMutate: boolean }) {
  const [item, setItem] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const names = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);
  const amount = caseFromRow(item).amount;
  const due = item.dueAt && item.status !== 'done' && item.status !== 'dismissed' ? dueChip(item.dueAt, today) : null;
  const locked = !canMutate || busy;

  const run = useCallback(async (call: () => Promise<Record<string, unknown>>, success: string, adopt = true) => {
    setBusy(true);
    setFlash(null);
    try {
      const result = await call();
      if (adopt) setItem(result as CaseRecord);
      else setItem((await request(`/api/actions/${initial.id}`, 'GET')) as CaseRecord);
      setFlash({ tone: 'ok', text: success });
      notifyNavigation();
      return true;
    } catch (cause) {
      setFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'The request failed' });
      // Reload so the page shows what the server actually kept.
      try { setItem((await request(`/api/actions/${initial.id}`, 'GET')) as CaseRecord); } catch { /* keep the last known state */ }
      return false;
    } finally {
      setBusy(false);
    }
  }, [initial.id]);

  const patch = (body: Record<string, unknown>, success: string) => run(() => request(`/api/actions/${item.id}`, 'PATCH', body), success);

  const addStep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('title') || '').trim();
    if (!title) return;
    void run(() => request(`/api/actions/${item.id}/steps`, 'POST', { title }), 'Step added.').then((saved) => { if (saved) form.reset(); });
  };

  const syncCase = (direction: 'push' | 'pull') => run(
    () => request(`/api/actions/${item.id}/sync${direction === 'pull' ? '?direction=pull' : ''}`, 'POST'),
    direction === 'pull' ? 'Checked Paperless for changes.' : 'Pushed to Paperless.',
    false
  );

  const stepsDone = item.steps.filter((step) => step.status === 'done').length;
  const activity = collapseEvents(item.events, names);

  return <div className="page-column inbox case-detail">
    <Link className="link case-back" href="/inbox"><ArrowLeft size={14} aria-hidden="true" /> Needs you</Link>
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{item.title}</h1>
        {item.summary ? <p className="page-description">{item.summary}</p> : null}
        <p className="meta meta-parts">
          <span><Link href={`/documents/${item.paperlessDocumentId}`}>Document #{item.paperlessDocumentId}</Link></span>
          {amount ? <span>{amount}</span> : null}
        </p>
      </div>
    </header>

    <div className="inbox-status" role="status" aria-live="polite">
      {flash ? <p className={flash.tone === 'ok' ? 'inbox-notice' : 'inbox-error'}>{flash.text}</p> : null}
    </div>
    {!canMutate ? <p className="meta">You have read-only household access.</p> : null}

    {item.status === 'suggested' && canMutate ? <div className="alert case-suggestion">
      <p>Tagvico suggested this action from the document.</p>
      <div className="case-suggestion-actions">
        <button type="button" className="btn btn-primary btn-32" disabled={locked} onClick={() => patch({ status: 'open' }, 'Suggestion accepted.')}>Accept</button>
        <button type="button" className="btn btn-secondary btn-32" disabled={locked} onClick={() => patch({ status: 'dismissed' }, 'Suggestion dismissed.')}>Dismiss</button>
      </div>
    </div> : null}

    <section className="section" aria-label="Properties">
      <div className="list">
        {item.status === 'suggested' ? null : <div className="list-row prop-row">
          <label className="field-label" htmlFor="case-status">Status</label>
          <select id="case-status" className="select select-32 prop-control" disabled={locked} value={item.status} onChange={(event) => patch({ status: event.target.value }, 'Status saved.')}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>}
        <div className="list-row prop-row">
          <label className="field-label" htmlFor="case-assignee">Assigned to</label>
          <select id="case-assignee" className="select select-32 prop-control" disabled={locked} value={item.assigneeMemberId || ''} onChange={(event) => patch({ assigneeMemberId: event.target.value || null }, event.target.value ? `Assigned to ${names.get(event.target.value) || 'a member'}.` : 'Unassigned.')}>
            <option value="">Unassigned</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </div>
        <div className="list-row prop-row">
          <label className="field-label" htmlFor="case-priority">Priority</label>
          <select id="case-priority" className="select select-32 prop-control" disabled={locked} value={item.priority} onChange={(event) => patch({ priority: event.target.value }, 'Priority saved.')}>
            {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
          </select>
        </div>
        <div className="list-row prop-row">
          <div className="prop-label">
            <label className="field-label" htmlFor="case-due">Due date</label>
            {due ? <span className={`field-help${due.tone === 'overdue' ? ' is-danger-text' : ''}`}>{due.label}</span> : null}
          </div>
          <div className="prop-control prop-date">
            <input id="case-due" type="date" className="input input-32" disabled={locked} value={item.dueAt ? item.dueAt.slice(0, 10) : ''} onChange={(event) => patch({ dueAt: event.target.value || null }, event.target.value ? 'Due date saved.' : 'Due date cleared.')} />
            {item.dueAt ? <button type="button" className="btn btn-ghost btn-32" disabled={locked} onClick={() => patch({ dueAt: null }, 'Due date cleared.')}>Clear</button> : null}
          </div>
        </div>
      </div>
    </section>

    <section className="section" aria-label="Steps">
      <h2 className="section-title">Steps{item.steps.length ? <span className="group-count">{stepsDone}/{item.steps.length}</span> : null}</h2>
      {item.steps.length ? <ul className="list">
        {item.steps.map((step) => <li key={step.id} className="list-row case-step-row">
          <button
            type="button"
            className={`case-step${step.status === 'done' ? ' is-done' : ''}`}
            disabled={locked}
            aria-pressed={step.status === 'done'}
            onClick={() => run(() => request(`/api/actions/${item.id}/steps/${step.id}`, 'PATCH', { status: step.status === 'done' ? 'open' : 'done' }), step.status === 'done' ? 'Step reopened.' : 'Step done.')}
          >
            {step.status === 'done' ? <CircleCheck size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
            <span className="case-step-title">{step.title}</span>
            {step.due_at ? <small>{shortDate(step.due_at)}</small> : null}
          </button>
        </li>)}
      </ul> : <p className="meta">No steps yet.</p>}
      {canMutate ? <form className="case-add-step" onSubmit={addStep}>
        <input className="input input-32" name="title" required maxLength={240} placeholder="Add a step" aria-label="New step" disabled={busy} />
        <button type="submit" className="btn btn-secondary btn-32" disabled={busy}>Add</button>
      </form> : null}
    </section>

    <section className="section" aria-label="Paperless">
      <h2 className="section-title">Paperless</h2>
      <p className="meta case-sync">{SYNC_LABEL[item.syncStatus] || item.syncStatus}{item.lastSyncedAt ? ` · ${shortDateTime(item.lastSyncedAt)}` : ''}</p>
      {item.syncError ? <p className="inbox-error">{item.syncError}</p> : null}
      <div className="case-sync-actions">
        <button type="button" className="btn btn-secondary btn-32" disabled={locked} onClick={() => syncCase('push')}>Push to Paperless</button>
        <button type="button" className="btn btn-secondary btn-32" disabled={locked} onClick={() => syncCase('pull')}>Pull changes</button>
      </div>
    </section>

    <section className="section" aria-label="Activity">
      <h2 className="section-title">Activity</h2>
      {activity.length ? <ul className="case-activity">
        {activity.slice(0, 12).map((entry) => <li key={entry.id}>
          <span>{entry.text}{entry.count > 1 ? ` (${entry.count} times)` : ''}</span>
          <small>{entry.who ? `${entry.who} · ` : ''}{shortDateTime(entry.at)}</small>
        </li>)}
      </ul> : <p className="meta">Nothing has happened yet.</p>}
    </section>
  </div>;
}
