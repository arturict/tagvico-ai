'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Circle, CloudDownload, CloudUpload, ExternalLink, Plus } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
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

const SYNC_LABEL: Record<string, string> = { synced: 'In sync with Paperless', pending: 'Changes not pushed yet', error: 'Last sync failed', conflict: 'Paperless changed too' };

export function CaseDetail({ initial, members, today, canMutate }: { initial: CaseRecord; members: InboxMember[]; today: string; canMutate: boolean }) {
  const [item, setItem] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const names = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);
  const assignee = item.assigneeMemberId ? members.find((member) => member.id === item.assigneeMemberId) : undefined;
  const summary = caseFromRow(item);
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

  return <div className="inbox case-detail">
    <Link className="inbox-link case-back" href="/inbox"><ArrowLeft size={14} aria-hidden="true" /> Needs you</Link>
    <header className="case-head">
      <p className="inbox-eyebrow">Action</p>
      <h1>{item.title}</h1>
      <p className="inbox-lede">{item.summary || 'No summary yet.'}</p>
      <div className="inbox-card-meta">
        <span className={`inbox-chip-static${item.status === 'suggested' ? ' is-suggested' : ''}`}>{item.status === 'suggested' ? 'Suggested' : STATUS_OPTIONS.find((option) => option.value === item.status)?.label || item.status}</span>
        {due ? <span className={`inbox-chip-static is-${due.tone}`}>{due.label}</span> : null}
        {summary.amount ? <span className="inbox-chip-static is-amount">{summary.amount}</span> : null}
        {item.priority === 'urgent' || item.priority === 'high' ? <span className={`inbox-chip-static is-${item.priority}`}>{item.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : null}
        {assignee ? <span className="inbox-person"><MemberAvatar name={assignee.name} memberId={assignee.id} size={20} />{assignee.name}</span> : <span className="inbox-person is-unassigned">Unassigned</span>}
        <Link className="inbox-doc inbox-doc-link" href={`/documents/${item.paperlessDocumentId}`}>Document #{item.paperlessDocumentId}</Link>
      </div>
    </header>

    <div className="inbox-status" role="status" aria-live="polite">
      {flash ? <p className={flash.tone === 'ok' ? 'inbox-notice' : 'inbox-error'}>{flash.text}</p> : null}
    </div>
    {!canMutate ? <p className="inbox-muted">You have read-only household access.</p> : null}

    <div className="case-grid">
      <section className="case-panel" aria-label="Details">
        <h2>Details</h2>
        {item.status === 'suggested' && canMutate ? <div className="case-suggestion">
          <p>Tagvico suggested this action from the document. Accept it to keep it open, or dismiss it.</p>
          <div className="inbox-card-actions">
            <button type="button" className="inbox-btn is-primary" disabled={locked} onClick={() => patch({ status: 'open' }, 'Suggestion accepted.')}><Check size={15} aria-hidden="true" />Accept</button>
            <button type="button" className="inbox-btn" disabled={locked} onClick={() => patch({ status: 'dismissed' }, 'Suggestion dismissed.')}>Dismiss</button>
          </div>
        </div> : null}
        <div className="case-fields">
          {item.status === 'suggested' ? null : <label>Status
            <select disabled={locked} value={item.status} onChange={(event) => patch({ status: event.target.value }, 'Status saved.')}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>}
          <label>Assigned to
            <select disabled={locked} value={item.assigneeMemberId || ''} onChange={(event) => patch({ assigneeMemberId: event.target.value || null }, event.target.value ? `Assigned to ${names.get(event.target.value) || 'a member'}.` : 'Unassigned.')}>
              <option value="">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label>Priority
            <select disabled={locked} value={item.priority} onChange={(event) => patch({ priority: event.target.value }, 'Priority saved.')}>
              {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
            </select>
          </label>
          <label>Due date
            <span className="case-date">
              <input type="date" disabled={locked} value={item.dueAt ? item.dueAt.slice(0, 10) : ''} onChange={(event) => patch({ dueAt: event.target.value || null }, event.target.value ? 'Due date saved.' : 'Due date cleared.')} />
              {item.dueAt ? <button type="button" className="inbox-btn" disabled={locked} onClick={() => patch({ dueAt: null }, 'Due date cleared.')}>Clear</button> : null}
            </span>
          </label>
        </div>

        <h2 className="case-steps-title">Steps {item.steps.length ? <span>{stepsDone}/{item.steps.length}</span> : null}</h2>
        {item.steps.length ? <ul className="case-steps">
          {item.steps.map((step) => <li key={step.id}>
            <button
              type="button"
              className={`case-step${step.status === 'done' ? ' is-done' : ''}`}
              disabled={locked}
              aria-pressed={step.status === 'done'}
              onClick={() => run(() => request(`/api/actions/${item.id}/steps/${step.id}`, 'PATCH', { status: step.status === 'done' ? 'open' : 'done' }), step.status === 'done' ? 'Step reopened.' : 'Step done.')}
            >
              {step.status === 'done' ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
              <span>{step.title}</span>
              {step.due_at ? <small>{shortDate(step.due_at)}</small> : null}
            </button>
          </li>)}
        </ul> : <p className="person-note">No steps yet.</p>}
        {canMutate ? <form className="case-add-step" onSubmit={addStep}>
          <input name="title" required maxLength={240} placeholder="Add a step" aria-label="New step" disabled={busy} />
          <button type="submit" className="inbox-btn" disabled={busy}><Plus size={15} aria-hidden="true" />Add</button>
        </form> : null}
      </section>

      <aside className="case-panel" aria-label="Paperless and activity">
        <h2>Paperless</h2>
        <p className={`case-sync is-${item.syncStatus}`}>{SYNC_LABEL[item.syncStatus] || item.syncStatus}{item.lastSyncedAt ? ` · ${shortDateTime(item.lastSyncedAt)}` : ''}</p>
        {item.syncError ? <p className="inbox-error">{item.syncError}</p> : null}
        <div className="inbox-card-actions">
          <button type="button" className="inbox-btn" disabled={locked} onClick={() => syncCase('push')}><CloudUpload size={15} aria-hidden="true" />Push to Paperless</button>
          <button type="button" className="inbox-btn" disabled={locked} onClick={() => syncCase('pull')}><CloudDownload size={15} aria-hidden="true" />Pull changes</button>
        </div>
        <Link className="inbox-link case-source" href={`/documents/${item.paperlessDocumentId}`}><ExternalLink size={13} aria-hidden="true" /> View document #{item.paperlessDocumentId}</Link>

        <h2 className="case-steps-title">Activity</h2>
        {item.events.length ? <ul className="case-activity">
          {item.events.slice(0, 12).map((event) => <li key={event.id}>
            <span>{describeEvent(event, names)}</span>
            <small>{event.actor_member_id ? `${names.get(event.actor_member_id) || 'Someone'} · ` : ''}{shortDateTime(event.created_at)}</small>
          </li>)}
        </ul> : <p className="person-note">Nothing has happened yet.</p>}
      </aside>
    </div>
  </div>;
}
