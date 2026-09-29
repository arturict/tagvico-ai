'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, UserPlus, X } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import { addDays, dueChip, shortDate } from './dates';
import type { InboxApproval, InboxCase, InboxData, InboxMember, InboxPriority } from './types';

type Filter = 'all' | 'mine' | 'done' | `member:${string}`;
type GroupKey = 'overdue' | 'week' | 'later';

const PRIORITY_RANK: Record<InboxPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' }
];

function compareCases(a: InboxCase, b: InboxCase) {
  return (a.dueAt || '9999-12-31').localeCompare(b.dueAt || '9999-12-31')
    || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.title.localeCompare(b.title);
}

async function request(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'The request failed');
  return payload;
}

export function InboxFeed({ data }: { data: InboxData }) {
  const { today, me, members, canMutate, canDecide } = data;
  const [cases, setCases] = useState(data.cases);
  const [approvals, setApprovals] = useState(data.approvals);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const weekEnd = addDays(today, 7);
  const others = members.filter((member) => member.id !== me.id);
  const showPeople = members.length > 1;

  const matchesCase = (item: InboxCase, value: Filter) => {
    if (value === 'all') return true;
    if (value === 'mine') return item.assigneeId === me.id;
    if (value === 'done') return false;
    return item.assigneeId === value.slice('member:'.length);
  };
  // Approvals carry no assignee: the people who may decide see them under "Mine",
  // everyone else sees the ones they requested.
  const matchesApproval = (item: InboxApproval, value: Filter) => {
    if (value === 'all') return true;
    if (value === 'done') return false;
    const memberId = value === 'mine' ? me.id : value.slice('member:'.length);
    return item.requestedById === memberId || (memberId === me.id && canDecide);
  };

  const active = cases.filter((item) => item.status !== 'done');
  const doneThisWeek = cases.filter((item) => item.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const total = active.length + approvals.length;
  const count = (value: Filter) => value === 'done'
    ? doneThisWeek.length
    : active.filter((item) => matchesCase(item, value)).length + approvals.filter((item) => matchesApproval(item, value)).length;

  const visibleCases = active.filter((item) => matchesCase(item, filter)).sort(compareCases);
  const visibleApprovals = approvals.filter((item) => matchesApproval(item, filter));
  const grouped = GROUPS.map((group) => ({
    ...group,
    items: visibleCases.filter((item) => {
      const key: GroupKey = item.dueAt && item.dueAt < today ? 'overdue' : item.dueAt && item.dueAt <= weekEnd ? 'week' : 'later';
      return key === group.key;
    })
  }));

  const patchCase = async (item: InboxCase, patch: { status?: string; assigneeMemberId?: string | null }, done: string) => {
    setBusy(item.id); setError(''); setNotice('');
    try {
      const saved = await request(`/api/actions/${item.id}`, 'PATCH', patch);
      const status = String(saved.status ?? item.status) as InboxCase['status'];
      const assigneeId = saved.assigneeMemberId ? String(saved.assigneeMemberId) : null;
      setCases((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status, assigneeId, doneAt: status === 'done' ? today : null }
        : entry));
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed');
    } finally {
      setBusy(null);
    }
  };

  const decide = async (item: InboxApproval, decision: 'approved' | 'rejected') => {
    setBusy(item.id); setError(''); setNotice('');
    try {
      const result = await request(`/api/approvals/${item.id}`, 'POST', { decision });
      setApprovals((current) => current.filter((entry) => entry.id !== item.id));
      if (decision === 'rejected') setNotice('Change rejected.');
      else if (result.status === 'failed') setError('The change was approved but could not be applied. Ask Tagvico for details.');
      else setNotice('Change approved and applied.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed');
    } finally {
      setBusy(null);
    }
  };

  const chips: Array<{ value: Filter; label: string; member?: InboxMember }> = [{ value: 'all', label: 'All' }];
  if (showPeople) {
    chips.push({ value: 'mine', label: 'Mine' });
    for (const member of others) chips.push({ value: `member:${member.id}`, label: member.name, member });
  }
  chips.push({ value: 'done', label: 'Done this week' });

  const filterMember = filter.startsWith('member:') ? memberById.get(filter.slice('member:'.length)) : undefined;
  const nothingAtAll = total === 0 && doneThisWeek.length === 0;
  const empty = filter === 'done'
    ? doneThisWeek.length === 0
    : visibleCases.length === 0 && visibleApprovals.length === 0;

  return <div className="inbox">
    <header className="inbox-head">
      <div>
        <p className="inbox-eyebrow">Needs you</p>
        <h1>{total === 0 ? 'Nothing needs you' : total === 1 ? '1 thing needs you' : `${total} things need you`}</h1>
        <p className="inbox-lede">Open actions and changes waiting for a decision in {data.householdName}.</p>
      </div>
      <div className="inbox-head-links">
        <Link className="inbox-link" href="/actions">All actions</Link>
        <Link className="inbox-btn is-primary" href="/companion"><Sparkles size={15} aria-hidden="true" />Ask Tagvico</Link>
      </div>
    </header>

    {!canMutate ? <p className="inbox-muted">You have read-only household access.</p> : null}

    <div className="inbox-chips" role="group" aria-label="Filter the feed">
      {chips.map((chip) => <button
        key={chip.value}
        type="button"
        className="inbox-chip"
        aria-pressed={filter === chip.value}
        onClick={() => setFilter(chip.value)}
      >
        {chip.member ? <MemberAvatar name={chip.member.name} memberId={chip.member.id} size={20} /> : null}
        <span>{chip.label}</span>
        <span className="inbox-chip-count">{count(chip.value)}</span>
      </button>)}
    </div>

    <div className="inbox-status" role="status" aria-live="polite">
      {notice ? <p className="inbox-notice">{notice}</p> : null}
      {error ? <p className="inbox-error">{error}</p> : null}
    </div>

    {data.reviewCount > 0 && filter !== 'done' ? <p className="inbox-review">
      <Link href="/review">{data.reviewCount} {data.reviewCount === 1 ? 'suggestion is' : 'suggestions are'} waiting in the review queue</Link>
    </p> : null}

    {filter === 'done' ? <section className="inbox-group" aria-label="Done this week">
      <h2>Done this week <span>{doneThisWeek.length}</span></h2>
      <ul className="inbox-list">
        {doneThisWeek.map((item) => <CaseCard key={item.id} item={item} today={today} members={members} memberById={memberById} canMutate={canMutate} busy={busy === item.id}
          onReopen={() => patchCase(item, { status: 'open' }, 'Reopened.')} />)}
      </ul>
    </section> : <>
      {grouped.map((group) => group.items.length ? <section className="inbox-group" key={group.key} aria-label={group.label}>
        <h2 className={group.key === 'overdue' ? 'is-overdue' : undefined}>{group.label} <span>{group.items.length}</span></h2>
        <ul className="inbox-list">
          {group.items.map((item) => <CaseCard key={item.id} item={item} today={today} members={members} memberById={memberById} canMutate={canMutate} busy={busy === item.id}
            onDone={() => patchCase(item, { status: 'done' }, 'Marked as done.')}
            onAccept={() => patchCase(item, { status: 'open' }, 'Suggestion accepted.')}
            onAssign={(memberId) => patchCase(item, { assigneeMemberId: memberId }, memberId ? `Assigned to ${memberById.get(memberId)?.name || 'a member'}.` : 'Unassigned.')} />)}
        </ul>
      </section> : null)}

      {visibleApprovals.length ? <section className="inbox-group" aria-label="Waiting for approval">
        <h2>Waiting for approval <span>{visibleApprovals.length}</span></h2>
        <ul className="inbox-list">
          {visibleApprovals.map((item) => <li key={item.id} className="inbox-card is-approval">
            <div className="inbox-card-main">
              <p className="inbox-card-title">{item.title}</p>
              {item.detail ? <p className="inbox-card-summary">{item.detail}</p> : null}
              <div className="inbox-card-meta">
                <span className="inbox-chip-static">{item.meta}</span>
                {item.requestedById && item.requestedByName ? <span className="inbox-person"><MemberAvatar name={item.requestedByName} memberId={item.requestedById} size={20} />Asked by {item.requestedByName}</span> : <span className="inbox-person">Proposed by Tagvico</span>}
              </div>
            </div>
            <div className="inbox-card-actions">
              {canDecide ? <>
                <button type="button" className="inbox-btn is-primary" disabled={busy === item.id} onClick={() => decide(item, 'approved')}><Check size={15} aria-hidden="true" />Approve</button>
                <button type="button" className="inbox-btn" disabled={busy === item.id} onClick={() => decide(item, 'rejected')}><X size={15} aria-hidden="true" />Reject</button>
              </> : <span className="inbox-muted">An owner or adult decides</span>}
            </div>
          </li>)}
        </ul>
      </section> : null}
    </>}

    {empty ? <div className="inbox-empty">
      {nothingAtAll || filter === 'all' ? <>
        <h2>Nothing needs you right now</h2>
        <p>New letters that need a decision or a date will show up here. You can also ask Tagvico what is coming up.</p>
        <Link className="inbox-btn is-primary" href="/companion"><Sparkles size={15} aria-hidden="true" />Ask Tagvico</Link>
      </> : <>
        <h2>{filter === 'done' ? 'Nothing finished this week yet' : filter === 'mine' ? 'Nothing is assigned to you' : `Nothing for ${filterMember?.name || 'this member'}`}</h2>
        <p>{filter === 'done' ? 'Finished actions from the last seven days appear here.' : 'Switch to All to see the rest of the household.'}</p>
        <button type="button" className="inbox-btn" onClick={() => setFilter('all')}>Show all</button>
      </>}
    </div> : null}
  </div>;
}

function CaseCard({ item, today, members, memberById, canMutate, busy, onDone, onAccept, onAssign, onReopen }: {
  item: InboxCase;
  today: string;
  members: InboxMember[];
  memberById: Map<string, InboxMember>;
  canMutate: boolean;
  busy: boolean;
  onDone?: () => void;
  onAccept?: () => void;
  onAssign?: (memberId: string | null) => void;
  onReopen?: () => void;
}) {
  const assignee = item.assigneeId ? memberById.get(item.assigneeId) : undefined;
  const due = item.dueAt && item.status !== 'done' ? dueChip(item.dueAt, today) : null;
  return <li className={`inbox-card${due?.tone === 'overdue' ? ' is-overdue' : ''}`}>
    <div className="inbox-card-main">
      <Link className="inbox-card-title" href={`/actions/${item.id}`}>{item.title}</Link>
      {item.summary ? <p className="inbox-card-summary">{item.summary}</p> : null}
      <div className="inbox-card-meta">
        {due ? <span className={`inbox-chip-static is-${due.tone}`} title={item.dueAt ? shortDate(item.dueAt) : undefined}>{due.label}</span> : null}
        {item.status === 'done' && item.doneAt ? <span className="inbox-chip-static">Done {shortDate(item.doneAt)}</span> : null}
        {item.status === 'suggested' ? <span className="inbox-chip-static is-suggested">Suggested</span> : null}
        {item.status === 'waiting' ? <span className="inbox-chip-static">Waiting</span> : null}
        {item.priority === 'urgent' || item.priority === 'high' ? <span className={`inbox-chip-static is-${item.priority}`}>{item.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : null}
        {assignee ? <span className="inbox-person"><MemberAvatar name={assignee.name} memberId={assignee.id} size={20} />{assignee.name}</span> : <span className="inbox-person is-unassigned">Unassigned</span>}
        {item.documentId ? <span className="inbox-doc">Document #{item.documentId}</span> : null}
      </div>
    </div>
    {canMutate ? <div className="inbox-card-actions">
      {item.status === 'done' ? <button type="button" className="inbox-btn" disabled={busy} onClick={onReopen}><RotateCcw size={15} aria-hidden="true" />Reopen</button> : <>
        {item.status === 'suggested' ? <button type="button" className="inbox-btn is-primary" disabled={busy} onClick={onAccept}><Check size={15} aria-hidden="true" />Accept</button> : null}
        <button type="button" className={item.status === 'suggested' ? 'inbox-btn' : 'inbox-btn is-primary'} disabled={busy} onClick={onDone}><Check size={15} aria-hidden="true" />Done</button>
        {members.length > 1 && onAssign ? <AssignMenu members={members} current={item.assigneeId} disabled={busy} onPick={onAssign} title={item.title} /> : null}
      </>}
    </div> : null}
  </li>;
}

function AssignMenu({ members, current, disabled, onPick, title }: {
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
