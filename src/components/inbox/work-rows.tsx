'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check, Ellipsis } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { MemberAvatar } from '@/components/member-avatar';
import { dueChip, shortDate } from './dates';
import type { InboxApproval, InboxCase, InboxMember, InboxReview } from './types';
import { APPROVAL_REASON } from './workboard';

/** A run of rows under a small sentence-case heading. The count is plain secondary text. */
export function Group({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return <section aria-label={label}>
    <h2 className="list-group-heading">{label}{count === undefined ? null : <span className="group-count">{count}</span>}</h2>
    <ul className="list">{children}</ul>
  </section>;
}

/** The one secondary line under a row title; parts are separated by a middle dot drawn in CSS. */
function MetaLine({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return <p className="list-row-meta meta-parts">{shown.map((part, index) => <span key={index}>{part}</span>)}</p>;
}

function Person({ name, memberId }: { name: string; memberId: string }) {
  return <span className="work-person"><MemberAvatar name={name} memberId={memberId} size={16} />{name}</span>;
}

function Due({ label, tone }: { label: string; tone: 'overdue' | 'soon' | 'calm' }) {
  return <span className={tone === 'overdue' ? 'is-danger-text' : undefined}>{label}</span>;
}

const priorityText = (priority: InboxCase['priority'] | null) => priority === 'urgent' ? 'Urgent' : priority === 'high' ? 'High priority' : null;

/** "..." menu: the secondary actions of a row. Radix handles focus, arrow keys, Escape and outside clicks. */
function RowMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" className="btn btn-ghost btn-icon btn-32" disabled={disabled} aria-label={label}><Ellipsis aria-hidden="true" /></button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="menu work-menu" align="end" sideOffset={4} collisionPadding={8}>{children}</DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

function MenuItem({ onSelect, danger, children }: { onSelect: () => void; danger?: boolean; children: ReactNode }) {
  return <DropdownMenu.Item className={`menu-item${danger ? ' is-danger' : ''}`} onSelect={onSelect}>{children}</DropdownMenu.Item>;
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return <DropdownMenu.Item asChild className="menu-item"><Link href={href}>{children}</Link></DropdownMenu.Item>;
}

function AssignItems({ members, current, onPick }: { members: InboxMember[]; current: string | null; onPick: (memberId: string | null) => void }) {
  return <>
    <DropdownMenu.Label className="menu-label">Assign to</DropdownMenu.Label>
    <DropdownMenu.RadioGroup value={current ?? ''} onValueChange={(value) => { if ((value || null) !== current) onPick(value || null); }}>
      {members.map((member) => <DropdownMenu.RadioItem key={member.id} value={member.id} className="menu-item">
        <MemberAvatar name={member.name} memberId={member.id} size={20} />{member.name}
        <DropdownMenu.ItemIndicator className="menu-check"><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
      </DropdownMenu.RadioItem>)}
      <DropdownMenu.RadioItem value="" className="menu-item">
        Unassigned
        <DropdownMenu.ItemIndicator className="menu-check"><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
      </DropdownMenu.RadioItem>
    </DropdownMenu.RadioGroup>
  </>;
}

const openLabel = (href: string) => href.startsWith('/documents/') ? 'Open document' : href.startsWith('/actions/') ? 'Open action' : 'Open';

export function CaseRow({ item, today, members, memberById, canMutate, busy, showAssignee = true, onDone, onAccept, onDismiss, onAssign, onReopen }: {
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
  const isDone = item.status === 'done';
  const canAssign = members.length > 1 && Boolean(onAssign) && !isDone;
  const canDismiss = item.status === 'suggested' && Boolean(onDismiss);
  const documentHref = item.documentId ? `/documents/${item.documentId}` : null;
  const title = item.title;

  return <li className="list-row work-row is-interactive" data-case-id={item.id}>
    <div className="list-row-main">
      <Link className="list-row-title work-title" href={`/actions/${item.id}`}>{item.title}</Link>
      <MetaLine parts={[
        item.status === 'waiting' ? 'Waiting' : null,
        priorityText(item.priority) ? <strong className="work-priority">{priorityText(item.priority)}</strong> : null,
        documentHref ? <Link href={documentHref}>Document #{item.documentId}</Link> : null,
        item.amount,
        item.stepCount > 0 ? `${item.doneStepCount}/${item.stepCount} steps` : null,
        showAssignee && assignee ? <Person name={assignee.name} memberId={assignee.id} /> : null
      ]} />
    </div>
    <div className="list-row-trailing work-due">
      {due ? <Due {...due} /> : isDone && item.doneAt ? `Done ${shortDate(item.doneAt)}` : null}
    </div>
    {canMutate ? <div className="work-actions">
      {isDone
        ? <button type="button" className="btn btn-secondary btn-32" disabled={busy} onClick={onReopen}>Reopen</button>
        : item.status === 'suggested'
          ? <button type="button" className="btn btn-secondary btn-32" disabled={busy} onClick={onAccept}>Accept</button>
          : <button type="button" className="btn btn-secondary btn-32" disabled={busy} onClick={onDone}>Done</button>}
      <RowMenu label={`More actions for “${title}”`} disabled={busy}>
        {canAssign ? <AssignItems members={members} current={item.assigneeId} onPick={(memberId) => onAssign?.(memberId)} /> : null}
        {canAssign ? <DropdownMenu.Separator className="menu-separator" /> : null}
        {item.status === 'suggested' && onDone ? <MenuItem onSelect={onDone}>Mark as done</MenuItem> : null}
        {canDismiss ? <MenuItem onSelect={() => onDismiss?.()} danger>Dismiss</MenuItem> : null}
        {documentHref ? <MenuLink href={documentHref}>Open document</MenuLink> : null}
      </RowMenu>
    </div> : null}
  </li>;
}

export function ApprovalRow({ item, today, canDecide, busy, onDecide }: {
  item: InboxApproval;
  today: string;
  canDecide: boolean;
  busy: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const due = item.dueAt ? dueChip(item.dueAt, today) : null;
  const reasonId = `approval-reason-${item.id}`;
  return <li className="list-row work-row" data-approval-id={item.id}>
    <div className="list-row-main">
      <p className="list-row-title">{item.title}</p>
      <MetaLine parts={[
        item.requestedById && item.requestedByName ? <Person name={item.requestedByName} memberId={item.requestedById} /> : 'Tagvico',
        priorityText(item.priority) ? <strong className="work-priority">{priorityText(item.priority)}</strong> : null,
        item.href && item.hrefLabel ? <Link href={item.href}>{item.hrefLabel}</Link> : null,
        item.amount
      ]} />
      {item.detail ? <p className="list-row-meta is-wrapping">{item.detail}</p> : null}
      {canDecide ? null : <p id={reasonId} className="list-row-meta is-wrapping">{APPROVAL_REASON}</p>}
    </div>
    <div className="list-row-trailing work-due">
      {due ? <Due {...due} /> : item.requestedOn ? shortDate(item.requestedOn) : null}
    </div>
    <div className="work-actions">
      <button type="button" className="btn btn-primary btn-32" disabled={busy || !canDecide} aria-describedby={canDecide ? undefined : reasonId} onClick={() => onDecide('approved')}>{busy ? 'Working…' : 'Approve'}</button>
      <RowMenu label={`More actions for “${item.title}”`} disabled={busy}>
        <DropdownMenu.Item className="menu-item is-danger" disabled={!canDecide} aria-describedby={canDecide ? undefined : reasonId} onSelect={() => onDecide('rejected')}>Reject</DropdownMenu.Item>
        {item.href ? <MenuLink href={item.href}>{openLabel(item.href)}</MenuLink> : null}
      </RowMenu>
    </div>
  </li>;
}

export function ReviewRow({ item, canDecide, busy, onDecide }: {
  item: InboxReview;
  canDecide: boolean;
  busy: boolean;
  onDecide: (action: 'apply' | 'reject') => void;
}) {
  return <li className="list-row work-row is-interactive" data-review-id={item.id}>
    <div className="list-row-main">
      <Link className="list-row-title work-title" href={`/documents/${item.documentId}`}>{item.title}</Link>
      <MetaLine parts={[item.changes.length ? `Changes ${item.changes.join(', ')}` : null]} />
    </div>
    <div className="list-row-trailing work-due">{item.stagedOn ? shortDate(item.stagedOn) : null}</div>
    <div className="work-actions">
      <button type="button" className="btn btn-secondary btn-32" disabled={busy || !canDecide} onClick={() => onDecide('apply')}>{busy ? 'Working…' : 'Apply'}</button>
      <RowMenu label={`More actions for “${item.title}”`} disabled={busy}>
        <DropdownMenu.Item className="menu-item is-danger" disabled={!canDecide} onSelect={() => onDecide('reject')}>Reject</DropdownMenu.Item>
        <MenuLink href={`/documents/${item.documentId}`}>Open document</MenuLink>
      </RowMenu>
    </div>
  </li>;
}
