'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Activity, Ban, BookOpen, ChevronDown, ExternalLink, FileText, Hash, Inbox, LogOut, Megaphone, MessageCircle, PanelLeftClose,
  PanelLeftOpen, Send, Settings, SquarePen, Stamp, Tags, TriangleAlert, LayoutDashboard, Menu, Users, X
} from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { MemberAvatar } from '@/components/member-avatar';
import type { HouseholdNavigation } from '@/lib/server/household-navigation';

const primaryLinks = [
  { href: '/companion', label: 'Chat', description: 'Ask across your archive', Icon: MessageCircle },
  { href: '/inbox', label: 'Needs you', description: 'Approvals, deadlines and review items', Icon: Inbox },
  { href: '/documents', label: 'Documents', description: 'Search and open your Paperless documents', Icon: FileText }
] as const;

const moreLinks = [
  { href: '/review', label: 'Review queue', description: 'Approve document filing suggestions', Icon: Stamp },
  { href: '/tags', label: 'Organize tags', description: 'Review and merge duplicate tags', Icon: Tags },
  { href: '/activity', label: 'Activity', description: 'See, restore or re-run changes', Icon: Activity },
  { href: '/automation', label: 'Overview', description: 'Processing overview and recovery', Icon: LayoutDashboard }
] as const;

const NEW_CHAT_HREF = '/companion?new=1';
const PEOPLE_OPEN_KEY = 'tagvicoPeopleOpen';

const channelStateText = {
  connected: 'Connected',
  configured: 'Configured',
  'needs-setup': 'Needs setup',
  error: 'Error',
  off: 'Off'
} as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Channels = HouseholdNavigation['channels'];
type Member = HouseholdNavigation['members'][number];

function personLabel(member: Member, currentMemberId: string) {
  return `${member.displayName}${member.id === currentMemberId ? ' (you)' : ''}, ${member.openCount} open`;
}

/**
 * Household members as one compact row of avatars with open-count badges. The
 * disclosure swaps the row for the full list with names and counts. The state is
 * shared by the sidebar and the mobile menu and remembered in localStorage.
 */
function HouseholdPeople({ household, pathname, open, onToggle, max, variant }: {
  household: HouseholdNavigation;
  pathname: string;
  open: boolean;
  onToggle: (next: boolean) => void;
  max: number;
  variant: 'sidebar' | 'sheet';
}) {
  const listId = `${useId()}-people-list`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { members, currentMemberId } = household;
  const shown = members.slice(0, max);
  const hidden = members.slice(max);
  const hiddenOpen = hidden.reduce((sum, member) => sum + member.openCount, 0);

  return <section className="sidebar-section people-section" aria-label="People">
    <div className="people-head-row">
      <p className="sidebar-section-title nav-copy">People</p>
      <button ref={toggleRef} type="button" className="people-toggle nav-copy" aria-expanded={open} aria-controls={listId} onClick={() => onToggle(!open)}>
        <span>{open ? 'Show fewer' : 'Show all'}</span><ChevronDown aria-hidden="true" />
      </button>
    </div>
    <ul className="people-row" aria-label="Household members" hidden={open}>
      {shown.map((member) => {
        const href = `/people/${member.id}`;
        const current = pathname === href;
        return <li key={member.id}>
          <Link href={href} className={`people-chip${isCurrent(pathname, href) ? ' is-active' : ''}${member.id === currentMemberId ? ' is-you' : ''}`}
            aria-label={personLabel(member, currentMemberId)} aria-current={current ? 'page' : undefined} title={personLabel(member, currentMemberId)}>
            <MemberAvatar name={member.displayName} memberId={member.id} size={variant === 'sheet' ? 38 : 30} />
            {member.openCount > 0 ? <span className="people-badge" aria-hidden="true">{member.openCount > 99 ? '99+' : member.openCount}</span> : null}
          </Link>
        </li>;
      })}
      {hidden.length > 0 ? <li>
        <button type="button" className="people-chip people-more" aria-expanded={open} aria-controls={listId}
          aria-label={`${hidden.length} more ${hidden.length === 1 ? 'person' : 'people'}, ${hiddenOpen} open. Show all`}
          title="Show all people"
          onClick={() => { onToggle(true); window.setTimeout(() => toggleRef.current?.focus(), 0); }}>
          +{hidden.length}
        </button>
      </li> : null}
    </ul>
    <ul className="sidebar-people" id={listId} hidden={!open}>
      {members.map((member) => {
        const href = `/people/${member.id}`;
        return <li key={member.id}>
          <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={personLabel(member, currentMemberId)}>
            <MemberAvatar name={member.displayName} memberId={member.id} size={24} />
            <span className="sidebar-person-name nav-copy">{member.displayName}{member.id === currentMemberId ? <em> you</em> : null}</span>
            <span className="sidebar-person-count nav-copy">{member.openCount} open</span>
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}

function ChannelList({ channels, canConfigure }: { channels: Channels; canConfigure: boolean }) {
  return <ul className="sidebar-channels">
    {([['telegram', 'Telegram', Send], ['discord', 'Discord', Hash]] as const).map(([key, name, Icon]) => {
      const channel = channels[key];
      const content = <>
        <Icon className="nav-icon" aria-hidden="true" />
        <span className="nav-copy">{name}</span>
        <span className="channel-state nav-copy">{channelStateText[channel.state]}</span>
        <span className={`status-dot is-${channel.state}`} aria-hidden="true" />
      </>;
      const label = `${name}: ${channel.label}`;
      return <li key={key}>
        {canConfigure
          ? <Link href="/settings/automation" title={`${label}. Open channel settings`} aria-label={`${label}. Open channel settings`}>{content}</Link>
          : <span className="sidebar-channel-static" title={label} aria-label={label} role="group">{content}</span>}
      </li>;
    })}
  </ul>;
}

function NeedsBadge({ count, overdue }: { count: number; overdue: number }) {
  if (count <= 0) return null;
  return <span className={`nav-badge nav-badge-total nav-badge-needs${overdue > 0 ? ' is-urgent' : ''}`} aria-label={`${count} ${count === 1 ? 'item needs' : 'items need'} you${overdue > 0 ? `, ${overdue} overdue` : ''}`}>{count}</span>;
}

export function AppNavigationShell({ children, workspaceName, userLabel, workspaceRole, initialWriteMode, initialNavigation }: {
  children: React.ReactNode;
  workspaceName: string;
  userLabel: string;
  workspaceRole: string;
  initialWriteMode: 'review' | 'automatic';
  initialNavigation?: HouseholdNavigation;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [writeMode, setWriteMode] = useState(initialWriteMode);
  const [recoveryCounts, setRecoveryCounts] = useState({ failed: 0, ignored: 0, ocr: 0 });
  const [household, setHousehold] = useState<HouseholdNavigation | undefined>(initialNavigation);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuWasOpen = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('tagvicoSidebarCollapsed') === 'true');
    setPeopleOpen(window.localStorage.getItem(PEOPLE_OPEN_KEY) === 'true');
  }, []);

  const togglePeople = useCallback((next: boolean) => {
    setPeopleOpen(next);
    window.localStorage.setItem(PEOPLE_OPEN_KEY, String(next));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // The sheet behaves as a modal dialog: focus moves into it, Tab cycles between
  // the menu button and the sheet, Escape closes it and focus returns to the button.
  useEffect(() => {
    if (!menuOpen) {
      if (menuWasOpen.current) menuButtonRef.current?.focus();
      menuWasOpen.current = false;
      return;
    }
    menuWasOpen.current = true;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const inside = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || [])
        .filter((element) => element.offsetParent !== null);
      const cycle = menuButtonRef.current ? [menuButtonRef.current, ...inside] : inside;
      if (!cycle.length) return;
      const index = cycle.indexOf(document.activeElement as HTMLElement);
      // Focus on the sheet itself (index -1) enters the list at its first or last control.
      const next = index === -1
        ? (event.shiftKey ? cycle[cycle.length - 1] : cycle[Math.min(1, cycle.length - 1)])
        : event.shiftKey
          ? cycle[index === 0 ? cycle.length - 1 : index - 1]
          : cycle[index === cycle.length - 1 ? 0 : index + 1];
      event.preventDefault();
      next.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const updateWriteMode = (event: Event) => {
      const next = (event as CustomEvent<{ writeMode?: string }>).detail?.writeMode;
      if (next === 'review' || next === 'automatic') setWriteMode(next);
    };
    window.addEventListener('tagvico:write-mode', updateWriteMode);
    return () => window.removeEventListener('tagvico:write-mode', updateWriteMode);
  }, []);

  useEffect(() => {
    let active = true;
    const loadCounts = async () => {
      try {
        const counts = await fetchJson<{ failed?: number; ignored?: number; ocr?: number }>('/api/navigation/counts');
        if (active) setRecoveryCounts({
          failed: Number(counts.failed) || 0,
          ignored: Number(counts.ignored) || 0,
          ocr: Number(counts.ocr) || 0
        });
      } catch {
        // Navigation remains usable when recovery metrics are temporarily unavailable.
      }
    };
    const loadHousehold = async () => {
      try {
        const next = await fetchJson<HouseholdNavigation>('/api/navigation/household');
        if (active) setHousehold(next);
      } catch {
        // The last known household state stays visible when a refresh fails.
      }
    };
    const refresh = () => {
      void loadCounts();
      void loadHousehold();
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('tagvico:navigation-refresh', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('tagvico:navigation-refresh', refresh);
    };
  }, [pathname]);

  const toggle = () => setCollapsed((value) => {
    window.localStorage.setItem('tagvicoSidebarCollapsed', String(!value));
    return !value;
  });

  const recoveryTotal = recoveryCounts.failed + recoveryCounts.ignored;
  const visibleMoreLinks = moreLinks.filter(({ href }) =>
    (href !== '/review' || writeMode === 'review')
    && (href !== '/tags' || workspaceRole === 'owner')
  );
  const moreActive = visibleMoreLinks.some(({ href }) => isCurrent(pathname, href));
  const moreExpanded = moreOpen || moreActive || recoveryTotal > 0;
  const me = household?.members.find((member) => member.id === household.currentMemberId);
  const needsYou = household?.needsYouCount || 0;
  const overdue = household?.overdueCount || 0;

  const peopleCount = household ? `${household.members.length} ${household.members.length === 1 ? 'person' : 'people'}` : '';
  const needsLabel = needsYou > 0 ? `${needsYou} ${needsYou === 1 ? 'thing needs' : 'things need'} you` : '';

  return <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>

    <header className="mobile-bar">
      <Link href="/companion" className="mobile-bar-brand"><Image src="/tagvico-icon.png" alt="" width={28} height={28} /><span>Tagvico</span></Link>
      <button ref={menuButtonRef} type="button" className="mobile-bar-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-sheet" onClick={() => setMenuOpen((value) => !value)}>
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
    </header>
    {menuOpen ? <button type="button" tabIndex={-1} className="mobile-sheet-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
    <div ref={sheetRef} tabIndex={-1} className="mobile-sheet" id="mobile-sheet" role="dialog" aria-modal="true" aria-label="Menu" hidden={!menuOpen}>
      <p className="mobile-sheet-household"><strong>{household?.household.name || workspaceName}</strong><small>{peopleCount}{needsLabel ? ` · ${needsLabel}` : ''}</small></p>
      <Link href={NEW_CHAT_HREF} className="new-chat-button"><SquarePen aria-hidden="true" /><span>New chat</span></Link>
      {household && household.members.length > 0 ? <HouseholdPeople household={household} pathname={pathname} open={peopleOpen} onToggle={togglePeople} max={8} variant="sheet" /> : null}
      {household ? <section aria-label="Channels"><p className="sidebar-section-title">Channels</p><ChannelList channels={household.channels} canConfigure={household.canConfigureChannels} /></section> : null}
      <section aria-label="More">
        <p className="sidebar-section-title">More</p>
        <ul className="sidebar-people">
          {visibleMoreLinks.map(({ href, label, Icon }) => <li key={href}>
            <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined}>
              <Icon className="nav-icon" aria-hidden="true" /><span>{label}</span>
              {href === '/automation' && recoveryTotal > 0 ? <span className="nav-badge nav-badge-total" aria-label={`${recoveryTotal} recovery items`}>{recoveryTotal}</span> : null}
            </Link>
          </li>)}
          {household?.paperlessUrl ? <li><a href={household.paperlessUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="nav-icon" aria-hidden="true" /><span>Open Paperless<span className="sr-only"> (opens in a new tab)</span></span></a></li> : null}
          <li><a href="/docs"><BookOpen className="nav-icon" aria-hidden="true" /><span>Docs</span></a></li>
          <li><Link href="/changelog"><Megaphone className="nav-icon" aria-hidden="true" /><span>What&apos;s new</span></Link></li>
          <li><a href="/logout"><LogOut className="nav-icon" aria-hidden="true" /><span>Sign out{me ? ` (${me.displayName})` : ''}</span></a></li>
        </ul>
      </section>
    </div>
    <aside className="sidebar">
      <Link href="/companion" className="brand"><Image className="brand-mark" src="/tagvico-icon.png" alt="" width={31} height={31} /><span className="nav-copy">Tagvico</span><small className="nav-copy">workspace</small></Link>
      <button className="sidebar-collapse" type="button" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </button>
      <Link href="/actions" className="household-card nav-copy" title="Household overview">
        <span className="household-card-mark" aria-hidden="true"><Users /></span>
        <span className="household-card-copy">
          <strong>{household?.household.name || workspaceName}</strong>
          <small>{household ? peopleCount : 'Household'}</small>
        </span>
      </Link>
      <Link href={NEW_CHAT_HREF} className="new-chat-button" title="Start a new chat" aria-label="New chat"><SquarePen aria-hidden="true" /><span className="nav-copy">New chat</span></Link>
      <div className="sidebar-scroll">
        <nav className="nav" aria-label="Main navigation">
          {primaryLinks.map(({ href, label, description, Icon }) => <div className="nav-entry" key={href}>
            <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={collapsed ? `${label} — ${description}` : description}>
              <Icon className="nav-icon" aria-hidden="true" />
              <span className="nav-copy">{label}</span>
              {href === '/inbox' ? <NeedsBadge count={needsYou} overdue={overdue} /> : null}
            </Link>
          </div>)}
        </nav>

        {household && household.members.length > 0 ? <HouseholdPeople household={household} pathname={pathname} open={peopleOpen} onToggle={togglePeople} max={5} variant="sidebar" /> : null}

        {household ? <section className="sidebar-section" aria-label="Channels">
          <p className="sidebar-section-title nav-copy">Channels</p>
          <ChannelList channels={household.channels} canConfigure={household.canConfigureChannels} />
        </section> : null}

        <div className={`sidebar-more${moreExpanded ? ' is-open' : ''}`}>
          <button type="button" className="sidebar-more-toggle" aria-expanded={moreExpanded} aria-controls="sidebar-more-links" onClick={() => setMoreOpen(!moreExpanded)} title="More pages">
            <ChevronDown className="nav-icon" aria-hidden="true" />
            <span className="nav-copy">More</span>
            {!moreExpanded && recoveryTotal > 0 ? <span className="nav-badge nav-badge-total nav-copy" aria-label={`${recoveryTotal} recovery items`}>{recoveryTotal}</span> : null}
          </button>
          <div className="nav" id="sidebar-more-links" hidden={!moreExpanded}>
            {visibleMoreLinks.map(({ href, label, description, Icon }) => <div className="nav-entry" key={href}>
              <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={collapsed ? `${label} — ${description}` : description}>
                <Icon className="nav-icon" aria-hidden="true" />
                <span className="nav-copy">{label}</span>
                {href === '/automation' && recoveryTotal > 0
                  ? <span className="nav-badge nav-badge-total" aria-label={`${recoveryTotal} recovery items`}>{recoveryTotal}</span>
                  : null}
              </Link>
              {href === '/automation' && recoveryTotal > 0 ? <div className="nav-sub-links nav-copy">
                <Link href="/automation/recovery#failed-documents" title="Permanently failed documents">
                  <TriangleAlert aria-hidden="true" /><span>Failed</span><span className="nav-badge">{recoveryCounts.failed}</span>
                </Link>
                <Link href="/automation/recovery#ignored-documents" title="Permanently ignored documents">
                  <Ban aria-hidden="true" /><span>Ignored</span><span className="nav-badge">{recoveryCounts.ignored}</span>
                </Link>
              </div> : null}
            </div>)}
          </div>
        </div>
      </div>
      <div className="sidebar-foot">
        <div className="sidebar-utility-links">
          {household?.paperlessUrl
            ? <a href={household.paperlessUrl} target="_blank" rel="noopener noreferrer" title="Open Paperless in a new tab"><ExternalLink className="nav-icon" aria-hidden="true" /><span className="nav-copy">Open Paperless</span></a>
            : null}
          <a href="/docs" title="Documentation"><BookOpen className="nav-icon" aria-hidden="true" /><span className="nav-copy">Docs</span></a>
          <Link href="/changelog" title="What's new"><Megaphone className="nav-icon" aria-hidden="true" /><span className="nav-copy">What&apos;s new</span></Link>
          <Link href="/settings" className={isCurrent(pathname, '/settings') ? 'is-active' : undefined} aria-current={pathname === '/settings' ? 'page' : undefined} title="Connections, models and access"><Settings className="nav-icon" aria-hidden="true" /><span className="nav-copy">Settings</span></Link>
        </div>
        <div className="sidebar-identity">
          {me ? <MemberAvatar name={me.displayName} memberId={me.id} size={30} /> : <span aria-hidden="true">{workspaceName.slice(0, 1).toUpperCase()}</span>}
          <div className="nav-copy"><strong>{me?.displayName || workspaceName}</strong><small>{userLabel}</small></div>
          <a className="sidebar-signout" href="/logout" title="Sign out" aria-label="Sign out"><LogOut aria-hidden="true" /></a>
        </div>
      </div>
    </aside>
    <main className="main" inert={menuOpen || undefined}>{children}</main>

    <nav className="mobile-tabs" aria-label="Primary" inert={menuOpen || undefined}>
      {([['/companion', 'Chat', MessageCircle], ['/inbox', 'Needs you', Inbox], ['/documents', 'Documents', FileText], ['/settings', 'Settings', Settings]] as const).map(([href, label, Icon]) =>
        <Link key={href} href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined}>
          <Icon aria-hidden="true" /><span>{label}</span>
          {href === '/inbox' ? <NeedsBadge count={needsYou} overdue={overdue} /> : null}
        </Link>)}
    </nav>
  </div>;
}
