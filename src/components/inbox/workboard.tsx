'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { caseFromRow } from './case-mapper';
import { zurichToday } from './dates';
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
  const toast = useToast();
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

  /** Resolves to whether the change was saved. An empty `success` leaves the inline message to the caller. */
  const patchCase = useCallback(async (item: InboxCase, patch: { status?: InboxCase['status']; assigneeMemberId?: string | null }, success: string): Promise<boolean> => {
    if (!begin(item.id)) return false;
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
        ? { tone: 'warn', text: `${success} Paperless sync failed: ${String(saved.syncError)}`.trim(), href: `/actions/${item.id}`, linkLabel: 'Open the action' }
        : success ? { tone: 'ok', text: success } : null);
      notifyNavigation();
      return true;
    } catch (cause) {
      setCases((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'The request failed' });
      return false;
    } finally {
      end(item.id);
    }
  }, []);

  /**
   * Marks a case done. With a toast available the confirmation carries an Undo for a few seconds
   * that puts the case back where it was; without one the inline message confirms it.
   */
  const markDone = useCallback(async (item: InboxCase) => {
    const saved = await patchCase(item, { status: 'done' }, toast.available ? '' : 'Marked as done.');
    if (!saved || !toast.available) return;
    toast.show({
      message: 'Marked as done.',
      actionLabel: 'Undo',
      onAction: () => void patchCase({ ...item, status: 'done' }, { status: item.status === 'waiting' ? 'waiting' : 'open' }, 'Moved back to your list.')
    });
  }, [patchCase, toast]);

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

  return { cases, approvals, reviews, busy, flash, setFlash, patchCase, markDone, assign, decide, decideReview };
}

/** Result of the last action as one calm line: plain text, danger text only for errors. Stays in view while the list scrolls. */
export function FlashMessage({ flash }: { flash: Flash | null }) {
  return <div className="inbox-status" role="status" aria-live="polite">
    {flash ? <p className={flash.tone === 'error' ? 'inbox-error' : flash.tone === 'warn' ? 'inbox-warn' : 'inbox-notice'}>
      {flash.text}{flash.href ? <> <Link className="link" href={flash.href}>{flash.linkLabel || 'Open'}</Link></> : null}
    </p> : null}
  </div>;
}
