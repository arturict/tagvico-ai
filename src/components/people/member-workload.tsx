'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import { dueGroup, shortDate, type DueGroup } from '@/components/inbox/dates';
import type { InboxCase, InboxPriority } from '@/components/inbox/types';
import { ApprovalCard, CaseCard, FlashMessage, useWorkboard } from '@/components/inbox/workboard';
import type { PersonData } from './load-person';

const PRIORITY_RANK: Record<InboxPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const GROUPS: Array<{ key: DueGroup; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' }
];
const STATUS_LABEL: Record<string, string> = { approved: 'Approved', executed: 'Applied', rejected: 'Rejected', failed: 'Not applied' };

function compareCases(a: InboxCase, b: InboxCase) {
  return (a.dueAt || '9999-12-31').localeCompare(b.dueAt || '9999-12-31')
    || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.title.localeCompare(b.title);
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', adult: 'Adult', member: 'Member', viewer: 'Viewer' };

export function MemberWorkload({ data }: { data: PersonData }) {
  const { member, today, members, canMutate, canDecide } = data;
  const memberById = useMemo(() => new Map(members.map((entry) => [entry.id, entry])), [members]);
  const board = useWorkboard({ cases: data.cases, approvals: data.pendingApprovals, reviews: [] }, memberById);
  const { busy } = board;

  // A case reassigned away from this person leaves their page at once; the sidebar follows through the shared event.
  const mine = board.cases.filter((item) => item.assigneeId === member.id);
  const open = mine.filter((item) => item.status === 'suggested' || item.status === 'open' || item.status === 'waiting').sort(compareCases);
  const done = mine.filter((item) => item.status === 'done');
  const grouped = GROUPS.map((group) => ({ ...group, items: open.filter((item) => dueGroup(item.dueAt, today) === group.key) }));
  const overdue = grouped[0].items.length;
  const thisWeek = grouped[1].items.length;

  const caseProps = (item: InboxCase) => ({
    item,
    today,
    members,
    memberById,
    canMutate,
    busy: busy.has(item.id),
    showAssignee: false
  });

  return <div className="inbox person">
    <header className="person-head">
      <MemberAvatar name={member.name} memberId={member.id} size={64} />
      <div className="person-identity">
        <p className="inbox-eyebrow">{data.householdName}</p>
        <h1>{member.name}{data.isMe ? <span className="person-you">you</span> : null}</h1>
        <p className="inbox-lede">{ROLE_LABEL[member.role] || member.role}{member.role === 'owner' || member.role === 'adult' ? ' · can approve changes' : ' · cannot approve changes'}</p>
      </div>
      <Link className="inbox-btn" href={`/inbox?for=${data.isMe ? 'mine' : member.id}`}>Open in Needs you</Link>
    </header>

    <dl className="person-stats" aria-label={`${member.name}'s workload`}>
      <div><dt>Open</dt><dd>{open.length}</dd></div>
      <div className={overdue ? 'is-overdue' : undefined}><dt>Overdue</dt><dd>{overdue}</dd></div>
      <div><dt>This week</dt><dd>{thisWeek}</dd></div>
      <div><dt>Done this week</dt><dd>{done.length}</dd></div>
    </dl>

    <p className="person-access">
      {member.paperlessConfigured
        ? `Paperless access is set up${member.paperlessUserId ? ` for Paperless user #${member.paperlessUserId}` : ''}.`
        : member.role === 'owner'
          ? 'Uses the shared Paperless connection.'
          : 'No personal Paperless token yet, so changes approved by this person cannot be written to Paperless.'}
      {data.canEditAccess ? <> <Link href="/settings/people">{member.paperlessConfigured ? 'Manage access' : 'Set up access'}</Link></> : null}
    </p>

    {!canMutate ? <p className="inbox-muted">You have read-only household access.</p> : null}
    <FlashMessage flash={board.flash} />

    {open.length === 0 ? <div className="inbox-empty">
      <h2>Nothing open</h2>
      <p>{member.name} has no open actions. Assign one from Needs you or ask Tagvico what is coming up.</p>
      <Link className="inbox-btn is-primary" href="/inbox"><MessageSquare size={15} aria-hidden="true" />Open Needs you</Link>
    </div> : grouped.map((group) => group.items.length ? <section className="inbox-group" key={group.key} aria-label={group.label}>
      <h2 className={group.key === 'overdue' ? 'is-overdue' : undefined}>{group.label} <span>{group.items.length}</span></h2>
      <ul className="inbox-list">
        {group.items.map((item) => <CaseCard key={item.id} {...caseProps(item)}
          onDone={() => board.patchCase(item, { status: 'done' }, 'Marked as done.')}
          onAccept={() => board.patchCase(item, { status: 'open' }, 'Suggestion accepted.')}
          onDismiss={() => board.patchCase(item, { status: 'dismissed' }, 'Suggestion dismissed.')}
          onAssign={(memberId) => board.assign(item, memberId)} />)}
      </ul>
    </section> : null)}

    {board.approvals.length ? <section className="inbox-group" aria-label="Changes waiting for approval">
      <h2>Waiting for approval <span>{board.approvals.length}</span></h2>
      <ul className="inbox-list">
        {board.approvals.map((item) => <ApprovalCard key={item.id} item={item} today={today} canDecide={canDecide} busy={busy.has(item.id)} onDecide={(decision) => board.decide(item, decision)} />)}
      </ul>
    </section> : null}

    {done.length ? <section className="inbox-group" aria-label="Done this week">
      <h2>Done this week <span>{done.length}</span></h2>
      <ul className="inbox-list">
        {done.map((item) => <CaseCard key={item.id} {...caseProps(item)} onReopen={() => board.patchCase(item, { status: 'open' }, 'Reopened.')} />)}
      </ul>
    </section> : null}

    <section className="inbox-group" aria-label="Requested changes">
      <h2>Requested changes <span>{data.history.length + board.approvals.length}</span></h2>
      {data.history.length === 0 && board.approvals.length === 0
        ? <p className="person-note">{member.name} has not asked Tagvico for any changes yet.</p>
        : data.history.length === 0 ? null : <ul className="person-history">
          {data.history.map((entry) => <li key={entry.id}>
            <span className="person-history-title">{entry.title}</span>
            <span className={`inbox-chip-static${entry.status === 'failed' ? ' is-overdue' : ''}`}>{STATUS_LABEL[entry.status] || entry.status}{entry.on ? ` · ${shortDate(entry.on)}` : ''}</span>
            {entry.error ? <span className="person-history-error">{entry.error}</span> : null}
          </li>)}
        </ul>}
    </section>
  </div>;
}
