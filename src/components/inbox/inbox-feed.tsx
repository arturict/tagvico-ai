'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import { dueGroup, type DueGroup } from './dates';
import type { InboxApproval, InboxCase, InboxData, InboxMember, InboxPriority } from './types';
import { ApprovalCard, CaseCard, FlashMessage, ReviewCard, useWorkboard } from './workboard';

type Filter = 'all' | 'mine' | 'done' | `member:${string}`;

const PRIORITY_RANK: Record<InboxPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const GROUPS: Array<{ key: DueGroup; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' }
];

function compareCases(a: InboxCase, b: InboxCase) {
  return (a.dueAt || '9999-12-31').localeCompare(b.dueAt || '9999-12-31')
    || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.title.localeCompare(b.title);
}

/** The filter lives in the URL as ?for=mine, ?for=done or ?for=<member id>; no parameter means everyone. */
function filterFromParam(value: string): Filter {
  return value === 'mine' || value === 'done' ? value : value === 'all' ? 'all' : `member:${value}`;
}

function paramFromFilter(value: Filter) {
  return value === 'all' ? '' : value.startsWith('member:') ? value.slice('member:'.length) : value;
}

export function InboxFeed({ data }: { data: InboxData }) {
  const { today, me, members, canMutate, canDecide } = data;
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const board = useWorkboard({ cases: data.cases, approvals: data.approvals, reviews: data.reviews }, memberById);
  const { cases, approvals, reviews, busy, flash } = board;
  const [filter, setFilterState] = useState<Filter>(() => filterFromParam(data.initialFilter));

  const others = members.filter((member) => member.id !== me.id);
  const showPeople = members.length > 1;

  const setFilter = (value: Filter) => {
    setFilterState(value);
    const url = new URL(window.location.href);
    const param = paramFromFilter(value);
    if (param) url.searchParams.set('for', param); else url.searchParams.delete('for');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  };

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
  const matchesReview = (value: Filter) => value === 'all' || (value === 'mine' && canDecide);

  const active = cases.filter((item) => item.status === 'suggested' || item.status === 'open' || item.status === 'waiting');
  const doneThisWeek = cases.filter((item) => item.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  // Same definition as the sidebar badge: open cases plus pending approvals.
  const total = active.length + approvals.length;
  const count = (value: Filter) => value === 'done'
    ? doneThisWeek.length
    : active.filter((item) => matchesCase(item, value)).length
      + approvals.filter((item) => matchesApproval(item, value)).length;

  const visibleCases = active.filter((item) => matchesCase(item, filter)).sort(compareCases);
  const visibleApprovals = approvals.filter((item) => matchesApproval(item, filter));
  const visibleReviews = matchesReview(filter) ? reviews : [];
  const grouped = GROUPS.map((group) => ({ ...group, items: visibleCases.filter((item) => dueGroup(item.dueAt, today) === group.key) }));

  const chips: Array<{ value: Filter; label: string; member?: InboxMember }> = [{ value: 'all', label: 'All' }];
  if (showPeople) {
    chips.push({ value: 'mine', label: 'Mine' });
    for (const member of others) chips.push({ value: `member:${member.id}`, label: member.name, member });
  }
  chips.push({ value: 'done', label: 'Done this week' });

  const filterMember = filter.startsWith('member:') ? memberById.get(filter.slice('member:'.length)) : undefined;
  const empty = filter === 'done'
    ? doneThisWeek.length === 0
    : visibleCases.length === 0 && visibleApprovals.length === 0 && visibleReviews.length === 0;

  const caseProps = (item: InboxCase) => ({
    item,
    today,
    members,
    memberById,
    canMutate,
    busy: busy.has(item.id)
  });

  return <div className="inbox">
    <header className="inbox-head">
      <div>
        <p className="inbox-eyebrow">Needs you</p>
        <h1>{total === 0 ? 'Nothing needs you' : total === 1 ? '1 thing needs you' : `${total} things need you`}</h1>
        <p className="inbox-lede">Open actions and changes waiting for a decision in {data.householdName}.</p>
      </div>
      <div className="inbox-head-links">
        <Link className="inbox-link" href="/actions">All actions</Link>
        <Link className="inbox-btn is-primary" href="/companion"><MessageSquare size={15} aria-hidden="true" />Ask Tagvico</Link>
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

    <FlashMessage flash={flash} />

    {filter === 'done' ? <section className="inbox-group" aria-label="Done this week">
      <h2>Done this week <span>{doneThisWeek.length}</span></h2>
      <ul className="inbox-list">
        {doneThisWeek.map((item) => <CaseCard key={item.id} {...caseProps(item)}
          onReopen={() => board.patchCase(item, { status: 'open' }, 'Reopened.')} />)}
      </ul>
    </section> : <>
      {visibleApprovals.length ? <section className="inbox-group" aria-label="Waiting for approval">
        <h2>Waiting for approval <span>{visibleApprovals.length}</span></h2>
        <ul className="inbox-list">
          {visibleApprovals.map((item) => <ApprovalCard key={item.id} item={item} today={today} canDecide={canDecide} busy={busy.has(item.id)} onDecide={(decision) => board.decide(item, decision)} />)}
        </ul>
      </section> : null}

      {visibleReviews.length ? <section className="inbox-group" aria-label="Suggestions to review">
        <h2>Suggestions to review <span>{data.reviewTotal}</span></h2>
        <ul className="inbox-list">
          {visibleReviews.map((item) => <ReviewCard key={item.id} item={item} canDecide={canDecide} busy={busy.has(`review-${item.id}`)} onDecide={(action) => board.decideReview(item, action)} />)}
        </ul>
        {data.reviewTotal > reviews.length ? <p className="inbox-review"><Link href="/review">Open the review queue for {data.reviewTotal - reviews.length} more</Link></p> : null}
      </section> : null}

      {grouped.map((group) => group.items.length ? <section className="inbox-group" key={group.key} aria-label={group.label}>
        <h2 className={group.key === 'overdue' ? 'is-overdue' : undefined}>{group.label} <span>{group.items.length}</span></h2>
        <ul className="inbox-list">
          {group.items.map((item) => <CaseCard key={item.id} {...caseProps(item)}
            onDone={() => board.patchCase(item, { status: 'done' }, 'Marked as done.')}
            onAccept={() => board.patchCase(item, { status: 'open' }, 'Suggestion accepted.')}
            onDismiss={() => board.patchCase(item, { status: 'dismissed' }, 'Suggestion dismissed.')}
            onAssign={(memberId) => board.assign(item, memberId)} />)}
        </ul>
      </section> : null)}
    </>}

    {empty ? <div className="inbox-empty">
      {filter === 'all' ? <>
        <h2>Nothing needs you right now</h2>
        <p>New letters that need a decision or a date will show up here. You can also ask Tagvico what is coming up.</p>
        <Link className="inbox-btn is-primary" href="/companion"><MessageSquare size={15} aria-hidden="true" />Ask Tagvico</Link>
      </> : <>
        <h2>{filter === 'done' ? 'Nothing finished this week yet' : filter === 'mine' ? 'Nothing is assigned to you' : `Nothing for ${filterMember?.name || 'this member'}`}</h2>
        <p>{filter === 'done' ? 'Finished actions from the last seven days appear here.' : 'Switch to All to see the rest of the household.'}</p>
        <button type="button" className="inbox-btn" onClick={() => setFilter('all')}>Show all</button>
      </>}
    </div> : null}
  </div>;
}
