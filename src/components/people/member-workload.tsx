'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { shortDate } from '@/components/inbox/dates';
import { groupCases } from '@/components/inbox/groups';
import type { InboxCase } from '@/components/inbox/types';
import { ApprovalRow, CaseRow, Group } from '@/components/inbox/work-rows';
import { FlashMessage, useWorkboard } from '@/components/inbox/workboard';
import type { PersonData } from './load-person';

const STATUS_LABEL: Record<string, string> = { approved: 'Approved', executed: 'Applied', rejected: 'Rejected', failed: 'Not applied' };
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', adult: 'Adult', member: 'Member', viewer: 'Viewer' };

export function MemberWorkload({ data }: { data: PersonData }) {
  const { member, today, members, canMutate, canDecide } = data;
  const memberById = useMemo(() => new Map(members.map((entry) => [entry.id, entry])), [members]);
  const board = useWorkboard({ cases: data.cases, approvals: data.pendingApprovals, reviews: [] }, memberById);
  const { busy } = board;

  // A case reassigned away from this person leaves their page at once; the sidebar follows through the shared event.
  const mine = board.cases.filter((item) => item.assigneeId === member.id);
  const open = mine.filter((item) => item.status === 'suggested' || item.status === 'open' || item.status === 'waiting');
  const done = mine.filter((item) => item.status === 'done');
  const groups = groupCases(open, today);
  const overdue = groups.due[0].items.length;

  const caseRow = (item: InboxCase) => <CaseRow
    key={item.id}
    item={item}
    today={today}
    members={members}
    memberById={memberById}
    canMutate={canMutate}
    busy={busy.has(item.id)}
    showAssignee={false}
    onDone={() => void board.markDone(item)}
    onAccept={() => board.patchCase(item, { status: 'open' }, 'Suggestion accepted.')}
    onDismiss={() => board.patchCase(item, { status: 'dismissed' }, 'Suggestion dismissed.')}
    onAssign={(memberId) => board.assign(item, memberId)}
    onReopen={() => board.patchCase(item, { status: 'open' }, 'Reopened.')} />;

  const summary = [`${open.length} open`, overdue ? `${overdue} overdue` : null, `${done.length} done this week`].filter(Boolean).join(' · ');
  const canApprove = member.role === 'owner' || member.role === 'adult';
  const needsToken = !member.paperlessConfigured && member.role !== 'owner';

  return <div className="page-column inbox person">
    <header className="page-header">
      <div className="person-identity">
        <MemberAvatar name={member.name} memberId={member.id} size={40} />
        <div className="page-header-text">
          <h1 className="page-title">{member.name}{data.isMe ? <span className="person-you"> (you)</span> : null}</h1>
          <p className="page-description">{ROLE_LABEL[member.role] || member.role}{canApprove ? ' · can approve changes' : ' · cannot approve changes'}</p>
        </div>
      </div>
      <div className="page-actions">
        <Link className="btn btn-secondary btn-32" href={`/inbox?for=${data.isMe ? 'mine' : member.id}`}>Open in Needs you</Link>
      </div>
    </header>

    <p className="meta person-summary">{summary}</p>
    {needsToken ? <p className="meta person-access">
      No Paperless token yet, so changes this person approves are not written to Paperless.
      {data.canEditAccess ? <> <Link className="link" href="/settings/people">Set up access</Link></> : null}
    </p> : null}

    {!canMutate ? <p className="meta">You have read-only household access.</p> : null}
    <FlashMessage flash={board.flash} />

    {open.length === 0 && board.approvals.length === 0 ? <div className="empty-state">
      <p>{member.name} has nothing open. <Link className="link" href="/inbox">Open Needs you</Link> to assign something.</p>
    </div> : null}

    {groups.due.map((group) => group.items.length
      ? <Group key={group.key} label={group.label} count={group.items.length}>{group.items.map(caseRow)}</Group>
      : null)}

    {board.approvals.length ? <Group label="Waiting for approval" count={board.approvals.length}>
      {board.approvals.map((item) => <ApprovalRow key={item.id} item={item} today={today} canDecide={canDecide} busy={busy.has(item.id)} onDecide={(decision) => board.decide(item, decision)} />)}
    </Group> : null}

    {groups.suggestions.length ? <Group label="Suggestions" count={groups.suggestions.length}>{groups.suggestions.map(caseRow)}</Group> : null}

    {done.length ? <Group label="Done this week" count={done.length}>{done.map(caseRow)}</Group> : null}

    {data.history.length ? <section aria-label="Requested changes">
      <h2 className="list-group-heading">Requested changes<span className="group-count">{data.history.length}</span></h2>
      <ul className="list">
        {data.history.map((entry) => <li key={entry.id} className="list-row">
          <div className="list-row-main">
            <p className="list-row-title">{entry.title}</p>
            {entry.error ? <p className="list-row-meta is-wrapping is-danger-text">{entry.error}</p> : null}
          </div>
          <div className={`list-row-trailing${entry.status === 'failed' ? ' is-danger-text' : ''}`}>{STATUS_LABEL[entry.status] || entry.status}{entry.on ? ` · ${shortDate(entry.on)}` : ''}</div>
        </li>)}
      </ul>
    </section> : null}
  </div>;
}
