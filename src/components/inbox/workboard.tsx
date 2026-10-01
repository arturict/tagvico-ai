'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, UserPlus, X } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import { caseFromRow } from './case-mapper';
import { dueChip, shortDate, zurichToday } from './dates';
import type { InboxApproval, InboxCase, InboxMember, InboxReview } from './types';

export const APPROVAL_REASON = 'Only an owner or adult can approve changes.';

type Row = Record<string, unknown>;
export type Flash = { tone: 'ok' | 'warn' | 'error'; text: string; href?: string; linkLabel?: string };

class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Row) {
    super(message);
  }
}

export async function request(url: string, method: string, body?: unknown): Promise<Row> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw new RequestError(typeof payload.error === 'string' && payload.error ? payload.error : 'The request failed', response.status, payload);
  return payload;
}

/** The sidebar counts (open per person, Needs you) listen for this and reload from the server. */
export function notifyNavigation() {
  window.dispatchEvent(new Event('tagvico:navigation-refresh'));
}

const asRow = (value: unknown): Row => (value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {});

/** Describes what an executed approval did, using the result the server stored. */
function executedFlash(approval: InboxApproval, executed: Row): { flash: Flash; created: InboxCase | null; updated: InboxCase | null } {
  const result = asRow(executed.result);
  const sync = asRow(result.sync);
  const caseRow = asRow(result.case);
  const syncNote = sync.ok === false ? ` Paperless sync failed: ${String(sync.error || 'unknown error')}` : '';
  const tone: Flash['tone'] = sync.ok === false ? 'warn' : 'ok';
  if (caseRow.id && executed.action_type === 'action.create') {
    return { flash: { tone, text: `Approved. The action was created.${syncNote}`, href: `/actions/${String(caseRow.id)}`, linkLabel: 'Open the action' }, created: caseFromRow(caseRow), updated: null };
  }
  if (caseRow.id) {
    return { flash: { tone, text: `Approved. The action was updated.${syncNote}`, href: `/actions/${String(caseRow.id)}`, linkLabel: 'Open the action' }, created: null, updated: caseFromRow(caseRow) };
  }
  if (Array.isArray(result.changedFields)) {
    return { flash: { tone: 'ok', text: `Approved. Paperless updated ${result.changedFields.map(String).join(', ')}.`, href: approval.href || undefined, linkLabel: approval.hrefLabel || undefined }, created: null, updated: null };
  }
  return { flash: { tone: 'ok', text: 'Approved. Paperless applied the change.' }, created: null, updated: null };
}

/**
 * State and server calls shared by the feed and the person page. Case changes are applied
 * at once and rolled back with the server's message when the request fails; every success
 * tells the sidebar to reload its counts.
 */
export function useWorkboard(initial: { cases: InboxCase[]; approvals: InboxApproval[]; reviews: InboxReview[] }, memberById: Map<string, InboxMember>) {
  const [cases, setCases] = useState(initial.cases);
  const [approvals, setApprovals] = useState(initial.approvals);
  const [reviews, setReviews] = useState(initial.reviews);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [flash, setFlash] = useState<Flash | null>(null);
  const inFlight = useRef(new Set<string>());

  const begin = (key: string) => {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    setFlash(null);
    return true;
  };
  const end = (key: string) => {
    inFlight.current.delete(key);
    setBusy(new Set(inFlight.current));
  };

  const patchCase = useCallback(async (item: InboxCase, patch: { status?: InboxCase['status']; assigneeMemberId?: string | null }, success: string) => {
    if (!begin(item.id)) return;
    const optimistic: InboxCase = {
      ...item,
      ...(patch.status ? { status: patch.status, doneAt: patch.status === 'done' ? zurichToday() : null } : {}),
      ...(patch.assigneeMemberId !== undefined ? { assigneeId: patch.assigneeMemberId } : {})
    };
    setCases((current) => current.map((entry) => (entry.id === item.id ? optimistic : entry)));
    try {
      const saved = await request(`/api/actions/${item.id}`, 'PATCH', patch);
      const next = caseFromRow(saved);
      setCases((current) => current.map((entry) => (entry.id === item.id ? next : entry)));
      const syncFailed = saved.syncStatus === 'error' && saved.syncError;
      setFlash(syncFailed
        ? { tone: 'warn', text: `${success} Paperless sync failed: ${String(saved.syncError)}`, href: `/actions/${item.id}`, linkLabel: 'Open the action' }
        : { tone: 'ok', text: success });
      notifyNavigation();
    } catch (cause) {
      setCases((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'The request failed' });
    } finally {
      end(item.id);
    }
  }, []);

  const assign = useCallback((item: InboxCase, memberId: string | null) => patchCase(
    item,
    { assigneeMemberId: memberId },
    memberId ? `Assigned to ${memberById.get(memberId)?.name || 'a member'}.` : 'Unassigned.'
  ), [memberById, patchCase]);

  const decide = useCallback(async (item: InboxApproval, decision: 'approved' | 'rejected') => {
    if (!begin(item.id)) return;
    try {
      const executed = await request(`/api/approvals/${item.id}`, 'POST', { decision });
      setApprovals((current) => current.filter((entry) => entry.id !== item.id));
      if (decision === 'rejected') {
        setFlash({ tone: 'ok', text: 'Change rejected.' });
      } else {
        const outcome = executedFlash(item, executed);
        const created = outcome.created;
        const updated = outcome.updated;
        if (created) setCases((current) => (current.some((entry) => entry.id === created.id) ? current : [...current, created]));
        if (updated) setCases((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        setFlash(outcome.flash);
      }
      notifyNavigation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The request failed';
      const status = cause instanceof RequestError ? cause.status : 0;
      const settled = asRow(cause instanceof RequestError ? cause.payload.approval : null).status;
      if (settled === 'failed') {
        // The decision was recorded, Paperless or the local write refused it: the card is settled, the error is real.
        setApprovals((current) => current.filter((entry) => entry.id !== item.id));
        setFlash({ tone: 'error', text: `Approved, but the change could not be applied: ${message}` });
        notifyNavigation();
      } else if (status === 400 && /no longer pending/i.test(message)) {
        setApprovals((current) => current.filter((entry) => entry.id !== item.id));
        setFlash({ tone: 'warn', text: 'Someone else already decided this change.' });
        notifyNavigation();
      } else {
        setFlash({ tone: 'error', text: message });
      }
    } finally {
      end(item.id);
    }
  }, []);

  const decideReview = useCallback(async (item: InboxReview, action: 'apply' | 'reject') => {
    const key = `review-${item.id}`;
    if (!begin(key)) return;
    try {
      await request(`/api/review-queue/${item.id}`, 'POST', { action });
      setReviews((current) => current.filter((entry) => entry.id !== item.id));
      setFlash({ tone: 'ok', text: action === 'apply' ? `Document #${item.documentId} was updated in Paperless.` : 'Suggestion rejected.' });
      notifyNavigation();
    } catch (cause) {
      setFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'The request failed' });
    } finally {
      end(key);
    }
  }, []);

  return { cases, approvals, reviews, busy, flash, setFlash, patchCase, assign, decide, decideReview };
}

export function FlashMessage({ flash }: { flash: Flash | null }) {
  return <div className="inbox-status" role="status" aria-live="polite">
    {flash ? <p className={flash.tone === 'error' ? 'inbox-error' : flash.tone === 'warn' ? 'inbox-warn' : 'inbox-notice'}>
      {flash.text}{flash.href ? <> <Link href={flash.href}>{flash.linkLabel || 'Open'}</Link></> : null}
    </p> : null}
  </div>;
}

export function CaseCard({ item, today, members, memberById, canMutate, busy, showAssignee = true, onDone, onAccept, onDismiss, onAssign, onReopen }: {
  item: InboxCase;
  today: string;
  members: InboxMember[];
  memberById: Map<string, InboxMember>;
  canMutate: boolean;
  busy: boolean;
  showAssignee?: boolean;
  onDone?: () => void;
  onAccept?: () => void;
  onDismiss?: () => void;
  onAssign?: (memberId: string | null) => void;
  onReopen?: () => void;
}) {
  const assignee = item.assigneeId ? memberById.get(item.assigneeId) : undefined;
  const due = item.dueAt && item.status !== 'done' ? dueChip(item.dueAt, today) : null;
  return <li className={`inbox-card${due?.tone === 'overdue' ? ' is-overdue' : ''}`} data-case-id={item.id}>
    <div className="inbox-card-main">
      <Link className="inbox-card-title" href={`/actions/${item.id}`}>{item.title}</Link>
      {item.summary ? <p className="inbox-card-summary">{item.summary}</p> : null}
      <div className="inbox-card-meta">
        {due ? <span className={`inbox-chip-static is-${due.tone}`}>{due.label}</span> : null}
        {item.amount ? <span className="inbox-chip-static is-amount">{item.amount}</span> : null}
        {item.status === 'done' && item.doneAt ? <span className="inbox-chip-static">Done {shortDate(item.doneAt)}</span> : null}
        {item.status === 'suggested' ? <span className="inbox-chip-static is-suggested">Suggested</span> : null}
        {item.status === 'waiting' ? <span className="inbox-chip-static">Waiting</span> : null}
        {item.priority === 'urgent' || item.priority === 'high' ? <span className={`inbox-chip-static is-${item.priority}`}>{item.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : null}
        {item.stepCount > 0 ? <span className="inbox-doc">{item.doneStepCount}/{item.stepCount} steps</span> : null}
        {showAssignee ? (assignee
          ? <span className="inbox-person"><MemberAvatar name={assignee.name} memberId={assignee.id} size={20} />{assignee.name}</span>
          : <span className="inbox-person is-unassigned">Unassigned</span>) : null}
        {item.documentId ? <Link className="inbox-doc inbox-doc-link" href={`/documents/${item.documentId}`}>Document #{item.documentId}</Link> : null}
      </div>
    </div>
    {canMutate ? <div className="inbox-card-actions">
      {item.status === 'done' ? <button type="button" className="inbox-btn" disabled={busy} onClick={onReopen}><RotateCcw size={15} aria-hidden="true" />Reopen</button> : <>
        {item.status === 'suggested' ? <button type="button" className="inbox-btn is-primary" disabled={busy} onClick={onAccept}><Check size={15} aria-hidden="true" />Accept</button> : null}
        <button type="button" className={item.status === 'suggested' ? 'inbox-btn' : 'inbox-btn is-primary'} disabled={busy} onClick={onDone}><Check size={15} aria-hidden="true" />Done</button>
        {members.length > 1 && onAssign ? <AssignMenu members={members} current={item.assigneeId} disabled={busy} onPick={onAssign} title={item.title} /> : null}
        {item.status === 'suggested' && onDismiss ? <button type="button" className="inbox-btn" disabled={busy} onClick={onDismiss}><X size={15} aria-hidden="true" />Dismiss</button> : null}
      </>}
    </div> : null}
  </li>;
}

export function AssignMenu({ members, current, disabled, onPick, title }: {
  members: InboxMember[];
  current: string | null;
  disabled: boolean;
  onPick: (memberId: string | null) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === 'Escape') setOpen(false); return; }
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const pick = (memberId: string | null) => { setOpen(false); if (memberId !== current) onPick(memberId); };
  return <div className="inbox-assign" ref={root}>
    <button type="button" className="inbox-btn" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`Assign “${title}”`} onClick={() => setOpen((value) => !value)}>
      <UserPlus size={15} aria-hidden="true" />Assign
    </button>
    {open ? <div className="inbox-menu" role="menu">
      {members.map((member) => <button key={member.id} type="button" role="menuitemradio" aria-checked={member.id === current} onClick={() => pick(member.id)}>
        <MemberAvatar name={member.name} memberId={member.id} size={20} />{member.name}
      </button>)}
      <button type="button" role="menuitemradio" aria-checked={current === null} onClick={() => pick(null)}>Unassigned</button>
    </div> : null}
  </div>;
}

export function ApprovalCard({ item, today, canDecide, busy, onDecide }: {
  item: InboxApproval;
  today: string;
  canDecide: boolean;
  busy: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const due = item.dueAt ? dueChip(item.dueAt, today) : null;
  const reasonId = `approval-reason-${item.id}`;
  return <li className="inbox-card is-approval" data-approval-id={item.id}>
    <div className="inbox-card-main">
      <p className="inbox-card-title">{item.title}</p>
      {item.detail ? <p className="inbox-card-summary">{item.detail}</p> : null}
      <div className="inbox-card-meta">
        <span className="inbox-chip-static">{item.meta}</span>
        {due ? <span className={`inbox-chip-static is-${due.tone}`}>{due.label}</span> : null}
        {item.amount ? <span className="inbox-chip-static is-amount">{item.amount}</span> : null}
        {item.priority === 'urgent' || item.priority === 'high' ? <span className={`inbox-chip-static is-${item.priority}`}>{item.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : null}
        {item.requestedById && item.requestedByName
          ? <span className="inbox-person"><MemberAvatar name={item.requestedByName} memberId={item.requestedById} size={20} />Asked by {item.requestedByName}</span>
          : <span className="inbox-person">Proposed by Tagvico</span>}
        {item.requestedOn ? <span className="inbox-doc">{shortDate(item.requestedOn)}</span> : null}
        {item.href && item.hrefLabel ? <Link className="inbox-doc inbox-doc-link" href={item.href}>{item.hrefLabel}</Link> : null}
      </div>
    </div>
    <div className="inbox-card-actions">
      <button type="button" className="inbox-btn is-primary" disabled={busy || !canDecide} aria-describedby={canDecide ? undefined : reasonId} onClick={() => onDecide('approved')}><Check size={15} aria-hidden="true" />{busy ? 'Working…' : 'Approve'}</button>
      <button type="button" className="inbox-btn" disabled={busy || !canDecide} aria-describedby={canDecide ? undefined : reasonId} onClick={() => onDecide('rejected')}><X size={15} aria-hidden="true" />Reject</button>
      {canDecide ? null : <span id={reasonId} className="inbox-reason">{APPROVAL_REASON}</span>}
    </div>
  </li>;
}

export function ReviewCard({ item, canDecide, busy, onDecide }: {
  item: InboxReview;
  canDecide: boolean;
  busy: boolean;
  onDecide: (action: 'apply' | 'reject') => void;
}) {
  return <li className="inbox-card is-approval" data-review-id={item.id}>
    <div className="inbox-card-main">
      <Link className="inbox-card-title" href={`/documents/${item.documentId}`}>{item.title}</Link>
      {item.changes.length ? <p className="inbox-card-summary">Suggests changing {item.changes.join(', ')}.</p> : null}
      <div className="inbox-card-meta">
        <span className="inbox-chip-static is-suggested">AI suggestion</span>
        <Link className="inbox-doc inbox-doc-link" href={`/documents/${item.documentId}`}>Document #{item.documentId}</Link>
        {item.stagedOn ? <span className="inbox-doc">{shortDate(item.stagedOn)}</span> : null}
      </div>
    </div>
    <div className="inbox-card-actions">
      <button type="button" className="inbox-btn is-primary" disabled={busy || !canDecide} onClick={() => onDecide('apply')}><Check size={15} aria-hidden="true" />{busy ? 'Working…' : 'Apply'}</button>
      <button type="button" className="inbox-btn" disabled={busy || !canDecide} onClick={() => onDecide('reject')}><X size={15} aria-hidden="true" />Reject</button>
    </div>
  </li>;
}
