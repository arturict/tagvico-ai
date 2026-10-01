'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, ChevronsUpDown, ExternalLink, LogOut, Megaphone, Settings } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { MemberAvatar } from '@/components/member-avatar';

export interface AccountMenuLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * The account row at the bottom of the sidebar. It opens the menu that holds everything that is not
 * a daily destination: Settings, Paperless, the review pages, release notes, docs and sign out.
 */
export function UserMenu({ name, memberId, role, links, recoveryTotal, paperlessUrl }: {
  name: string;
  memberId: string;
  role: string;
  /** Review queue, Organize tags, Activity and Overview, already filtered for this member. */
  links: AccountMenuLink[];
  recoveryTotal: number;
  paperlessUrl: string | null;
}) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" className="account-trigger" aria-label={`${name}, account menu`} title={name}>
        <MemberAvatar name={name} memberId={memberId} size={28} />
        <span className="account-text shell-copy"><strong>{name}</strong><span className="meta">{role}</span></span>
        <ChevronsUpDown className="account-chevron shell-copy" aria-hidden="true" />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="menu shell-menu" side="top" align="start" sideOffset={8} collisionPadding={8}>
        <DropdownMenu.Item asChild>
          <Link href="/settings" className="menu-item"><Settings aria-hidden="true" />Settings</Link>
        </DropdownMenu.Item>
        {paperlessUrl ? <DropdownMenu.Item asChild>
          <a href={paperlessUrl} target="_blank" rel="noopener noreferrer" className="menu-item">
            <ExternalLink aria-hidden="true" />Open Paperless<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </DropdownMenu.Item> : null}
        <DropdownMenu.Separator className="menu-separator" />
        {links.map(({ href, label, Icon }) => <DropdownMenu.Item key={href} asChild>
          <Link href={href} className="menu-item">
            <Icon aria-hidden="true" />{label}
            {href === '/automation' && recoveryTotal > 0 ? <span className="nav-badge meta">{recoveryTotal}<span className="sr-only"> recovery items</span></span> : null}
          </Link>
        </DropdownMenu.Item>)}
        <DropdownMenu.Separator className="menu-separator" />
        <DropdownMenu.Item asChild>
          <Link href="/changelog" className="menu-item"><Megaphone aria-hidden="true" />What&apos;s new</Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <a href="/docs" className="menu-item"><BookOpen aria-hidden="true" />Docs</a>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="menu-separator" />
        <DropdownMenu.Item asChild>
          <a href="/logout" className="menu-item"><LogOut aria-hidden="true" />Sign out</a>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
