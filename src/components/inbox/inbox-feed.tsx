'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Mascot } from '@/components/mascot/mascot';
import { groupCases } from './groups';
import type { InboxApproval, InboxCase, InboxData } from './types';
import { ApprovalRow, CaseRow, Group, ReviewRow } from './work-rows';
import { FlashMessage, useWorkboard } from './workboard';

type Filter = 'all' | 'mine' | 'done' | `member:${string}`;

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
  const others = members.filter((member) => member.id !== me.id);
  const showPeople = members.length > 1;
  // The select has no entry for the signed-in member (that is "Mine") and none for "Mine" in a household of one.
  const [filter, setFilterState] = useState<Filter>(() => {
    const requested = filterFromParam(data.initialFilter);
    if (requested === `member:${me.id}`) return showPeople ? 'mine' : 'all';
    return requested === 'mine' && !showPeople ? 'all' : requested;
  });

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

  const groups = groupCases(active.filter((item) => matchesCase(item, filter)), today);
  const visibleApprovals = approvals.filter((item) => matchesApproval(item, filter));
  const visibleReviews = matchesReview(filter) ? reviews : [];
  // The server loads a capped page of suggestions; decisions made here lower the number of queued ones too.
  const queuedReviews = data.reviewTotal - (data.reviews.length - reviews.length);
  const suggestionCount = groups.suggestions.length + (visibleReviews.length ? queuedReviews : 0);

  const filterMember = filter.startsWith('member:') ? memberById.get(filter.slice('member:'.length)) : undefined;
  const empty = filter === 'done'
    ? doneThisWeek.length === 0
    : groups.due.every((group) => group.items.length === 0) && groups.suggestions.length === 0 && visibleApprovals.length === 0 && visibleReviews.length === 0;

  const caseRow = (item: InboxCase) => <CaseRow
    key={item.id}
    item={item}
    today={today}
    members={members}
    memberById={memberById}
    canMutate={canMutate}
    busy={busy.has(item.id)}
    onDone={() => void board.markDone(item)}
    onAccept={() => board.patchCase(item, { status: 'open' }, 'Suggestion accepted.')}
    onDismiss={() => board.patchCase(item, { status: 'dismissed' }, 'Suggestion dismissed.')}
    onAssign={(memberId) => board.assign(item, memberId)}
    onReopen={() => board.patchCase(item, { status: 'open' }, 'Reopened.')} />;

  return <div className="page-column inbox">
    <header className="page-header">
      <h1 className="page-title">Needs you</h1>
      <div className="page-actions">
        <select className="select select-32 inbox-filter" aria-label="Filter needs" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="all">Everyone</option>
          {showPeople ? <option value="mine">Mine</option> : null}
          {showPeople ? others.map((member) => <option key={member.id} value={`member:${member.id}`}>{member.name}</option>) : null}
          <option value="done">Done this week</option>
        </select>
      </div>
    </header>

    {!canMutate ? <p className="meta">You have read-only household access.</p> : null}
    <FlashMessage flash={flash} />

    {filter === 'done' ? <Group label="Done this week" count={doneThisWeek.length}>
      {doneThisWeek.map(caseRow)}
    </Group> : <>
      {groups.due.map((group) => group.items.length
        ? <Group key={group.key} label={group.label} count={group.items.length}>{group.items.map(caseRow)}</Group>
        : null)}

      {visibleApprovals.length ? <Group label="Waiting for approval" count={visibleApprovals.length}>
        {visibleApprovals.map((item) => <ApprovalRow key={item.id} item={item} today={today} canDecide={canDecide} busy={busy.has(item.id)} onDecide={(decision) => board.decide(item, decision)} />)}
      </Group> : null}

      {groups.suggestions.length || visibleReviews.length ? <Group label="Suggestions" count={suggestionCount}>
        {groups.suggestions.map(caseRow)}
        {visibleReviews.map((item) => <ReviewRow key={item.id} item={item} canDecide={canDecide} busy={busy.has(`review-${item.id}`)} onDecide={(action) => board.decideReview(item, action)} />)}
        {visibleReviews.length && queuedReviews > visibleReviews.length
          ? <li className="list-row list-more"><Link className="link" href="/review">Open the review queue for {queuedReviews - visibleReviews.length} more</Link></li>
          : null}
      </Group> : null}
    </>}

    {empty ? <div className="empty-state inbox-empty">
      {filter === 'all' ? <>
        <Mascot pose="happy" size={64} />
        <p className="pg-empty-title">All caught up</p>
        <p>Nothing needs you right now. Enjoy the quiet, or <Link className="link" href="/companion">ask in chat</Link> what is coming up.</p>
      </> : <>
        <p>{filter === 'done' ? 'Nothing finished this week yet.' : filter === 'mine' ? 'Nothing is assigned to you.' : `Nothing for ${filterMember?.name || 'this member'}.`}</p>
        <button type="button" className="link link-button" onClick={() => setFilter('all')}>Show everyone</button>
      </>}
    </div> : null}
  </div>;
}
