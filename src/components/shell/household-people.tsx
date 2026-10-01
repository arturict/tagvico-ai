'use client';

import Link from 'next/link';
import { useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { MemberAvatar } from '@/components/member-avatar';
import type { HouseholdNavigation } from '@/lib/server/household-navigation';
import { isCurrent } from './routes';

type Member = HouseholdNavigation['members'][number];

function personLabel(member: Member, currentMemberId: string) {
  return `${member.displayName}${member.id === currentMemberId ? ' (you)' : ''}, ${member.openCount} open`;
}

/**
 * Household members as one line of avatars with open-count badges. The disclosure swaps the line
 * for the full list with names and counts. The sidebar and the mobile drawer share the open state,
 * which the shell remembers in localStorage.
 */
export function HouseholdPeople({ household, pathname, open, onToggle, max, avatarSize }: {
  household: HouseholdNavigation;
  pathname: string;
  open: boolean;
  onToggle: (next: boolean) => void;
  max: number;
  avatarSize: number;
}) {
  const listId = `${useId()}-people-list`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { members, currentMemberId } = household;
  const shown = members.slice(0, max);
  const hidden = members.slice(max);
  const hiddenOpen = hidden.reduce((sum, member) => sum + member.openCount, 0);

  return <section className="sidebar-section people-section" aria-label="People">
    <div className="people-head-row">
      <h2 className="sidebar-section-title">People</h2>
      <button ref={toggleRef} type="button" className="people-toggle" aria-expanded={open} aria-controls={listId} aria-label={open ? 'Show fewer people' : 'Show all people'} onClick={() => onToggle(!open)}>
        <span>{open ? 'Show fewer' : 'Show all'}</span><ChevronDown aria-hidden="true" />
      </button>
    </div>
    <ul className="people-row" aria-label="Household members" hidden={open}>
      {shown.map((member) => {
        const href = `/people/${member.id}`;
        return <li key={member.id}>
          <Link href={href} className={`people-chip${isCurrent(pathname, href) ? ' is-active' : ''}${member.id === currentMemberId ? ' is-you' : ''}`}
            aria-label={personLabel(member, currentMemberId)} aria-current={pathname === href ? 'page' : undefined} title={personLabel(member, currentMemberId)}>
            <MemberAvatar name={member.displayName} memberId={member.id} size={avatarSize} />
            {member.openCount > 0 ? <span className="people-badge" aria-hidden="true">{member.openCount > 99 ? '99+' : member.openCount}</span> : null}
          </Link>
        </li>;
      })}
      {hidden.length > 0 ? <li>
        <button type="button" className="people-chip people-more" style={{ width: avatarSize, height: avatarSize }} aria-expanded={open} aria-controls={listId}
          aria-label={`${hidden.length} more ${hidden.length === 1 ? 'person' : 'people'}, ${hiddenOpen} open. Show all`}
          title="Show all people"
          onClick={() => { onToggle(true); window.setTimeout(() => toggleRef.current?.focus(), 0); }}>
          +{hidden.length}
        </button>
      </li> : null}
    </ul>
    <ul className="list sidebar-people" id={listId} hidden={!open}>
      {members.map((member) => {
        const href = `/people/${member.id}`;
        return <li key={member.id}>
          <Link href={href} className={`sidebar-row${isCurrent(pathname, href) ? ' is-active' : ''}`} aria-current={pathname === href ? 'page' : undefined} title={personLabel(member, currentMemberId)}>
            <MemberAvatar name={member.displayName} memberId={member.id} size={24} />
            <span className="sidebar-row-label">{member.displayName}{member.id === currentMemberId ? <span className="meta"> you</span> : null}</span>
            <span className="meta sidebar-row-count">{member.openCount} open</span>
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}
