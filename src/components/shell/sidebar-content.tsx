'use client';

import Link from 'next/link';
import { FileText, Inbox, SquarePen } from 'lucide-react';
import type { HouseholdNavigation } from '@/lib/server/household-navigation';
import { ChatHistory } from './chat-history';
import type { ChatSession } from './chat-sessions';
import { HouseholdPeople } from './household-people';
import { NEW_CHAT_HREF, isCurrent } from './routes';
import { UserMenu, type AccountMenuLink } from './user-menu';

/** Everything the sidebar and the mobile drawer show; the shell owns the state and passes it down once. */
export interface SidebarModel {
  pathname: string;
  household?: HouseholdNavigation;
  needsYou: number;
  overdue: number;
  recoveryTotal: number;
  accountLinks: AccountMenuLink[];
  account: { name: string; memberId: string; role: string };
  peopleOpen: boolean;
  onTogglePeople: (next: boolean) => void;
  chats: {
    sessions: ChatSession[];
    failed: boolean;
    activeId: string;
    rename: (id: string, title: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };
}

function needsLabel(count: number, overdue: number) {
  if (count <= 0) return 'Needs you';
  return `Needs you, ${count} ${count === 1 ? 'item' : 'items'}${overdue > 0 ? `, ${overdue} overdue` : ''}`;
}

/**
 * Sidebar body shared by the desktop sidebar and the mobile drawer: New chat and the two daily
 * destinations, the household people row, the chat history and the account menu. The head (logo
 * with its collapse or close button) differs between the two and lives in the shell.
 */
export function SidebarContent({ model, variant, collapsed }: {
  model: SidebarModel;
  variant: 'sidebar' | 'sheet';
  collapsed: boolean;
}) {
  const { pathname, household, needsYou, overdue } = model;
  const rowTitle = (label: string) => collapsed ? label : undefined;

  return <>
    <nav className="sidebar-primary" aria-label="Main navigation">
      <Link href={NEW_CHAT_HREF} className="sidebar-row new-chat-button" title={collapsed ? 'New chat' : 'Start a new chat'}>
        <SquarePen aria-hidden="true" /><span className="sidebar-row-label shell-copy">New chat</span>
      </Link>
      <Link href="/inbox" className={`sidebar-row${isCurrent(pathname, '/inbox') ? ' is-active' : ''}`} aria-current={pathname === '/inbox' ? 'page' : undefined}
        aria-label={needsLabel(needsYou, overdue)} title={rowTitle('Needs you')}>
        <Inbox aria-hidden="true" /><span className="sidebar-row-label shell-copy">Needs you</span>
        {needsYou > 0 ? <span className={`nav-badge meta sidebar-row-count${overdue > 0 ? ' is-danger-text' : ''}`} aria-hidden="true">{needsYou}</span> : null}
      </Link>
      <Link href="/documents" className={`sidebar-row${isCurrent(pathname, '/documents') ? ' is-active' : ''}`} aria-current={pathname === '/documents' ? 'page' : undefined}
        title={rowTitle('Documents')}>
        <FileText aria-hidden="true" /><span className="sidebar-row-label shell-copy">Documents</span>
      </Link>
    </nav>
    <div className="sidebar-scroll">
      {household && household.members.length > 0
        ? <HouseholdPeople household={household} pathname={pathname} open={model.peopleOpen} onToggle={model.onTogglePeople}
          max={5} avatarSize={variant === 'sheet' ? 36 : 28} />
        : null}
      <ChatHistory sessions={model.chats.sessions} failed={model.chats.failed} activeChatId={model.chats.activeId}
        onRename={model.chats.rename} onDelete={model.chats.remove} />
    </div>
    <div className="sidebar-account">
      <UserMenu name={model.account.name} memberId={model.account.memberId} role={model.account.role} links={model.accountLinks}
        recoveryTotal={model.recoveryTotal} paperlessUrl={household?.paperlessUrl ?? null} />
    </div>
  </>;
}
