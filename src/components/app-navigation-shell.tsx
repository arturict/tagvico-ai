'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity, Ban, BookOpen, ChevronDown, ExternalLink, FileText, Inbox, LogOut, Megaphone, MessageCircle, PanelLeftClose,
  PanelLeftOpen, Send, Settings, Sparkles, Stamp, Tags, TriangleAlert, LayoutDashboard, Menu, X
} from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { MemberAvatar, MemberAvatarStack } from '@/components/member-avatar';
import type { HouseholdNavigation } from '@/lib/server/household-navigation';

const primaryLinks = [
  { href: '/companion', label: 'Ask Tagvico', description: 'Ask across your archive', Icon: Sparkles },
  { href: '/inbox', label: 'Needs you', description: 'Approvals, deadlines and review items', Icon: Inbox },
  { href: '/documents', label: 'Documents', description: 'Processed documents and their history', Icon: FileText }
] as const;

const moreLinks = [
  { href: '/review', label: 'Review queue', description: 'Approve document filing suggestions', Icon: Stamp },
  { href: '/tags', label: 'Organize tags', description: 'Review and merge duplicate tags', Icon: Tags },
  { href: '/activity', label: 'Activity', description: 'See, restore or re-run changes', Icon: Activity },
  { href: '/automation', label: 'Overview', description: 'Processing overview and recovery', Icon: LayoutDashboard }
] as const;

const channelLabels = {
  connected: 'connected',
  'needs-setup': 'needs a token',
  off: 'off'
} as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Channels = HouseholdNavigation['channels'];

function PeopleList({ household, pathname }: { household: HouseholdNavigation; pathname: string }) {
  return <ul className="sidebar-people">
    {household.members.map((member) => {
      const href = `/people/${member.id}`;
      return <li key={member.id}>
        <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={`${member.displayName} — ${member.openCount} open`}>
          <MemberAvatar name={member.displayName} memberId={member.id} size={24} />
          <span className="sidebar-person-name nav-copy">{member.displayName}{member.id === household.currentMemberId ? <em> you</em> : null}</span>
          <span className="sidebar-person-count nav-copy">{member.openCount} open</span>
        </Link>
      </li>;
    })}
  </ul>;
}

function ChannelList({ channels }: { channels: Channels }) {
  return <ul className="sidebar-channels">
    {([['telegram', 'Telegram', Send], ['discord', 'Discord', MessageCircle]] as const).map(([key, label, Icon]) => <li key={key}>
      <Link href="/settings" title={`${label}: ${channelLabels[channels[key]]}`}>
        <Icon className="nav-icon" aria-hidden="true" />
        <span className="nav-copy">{label}</span>
        <span className={`status-dot is-${channels[key]}`} role="img" aria-label={`${label} ${channelLabels[channels[key]]}`} />
      </Link>
    </li>)}
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
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('tagvicoSidebarCollapsed') === 'true');
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
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
  const stackMembers = (household?.members || []).map((member) => ({ id: member.id, name: member.displayName }));

  return <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>

    <header className="mobile-bar">
      <Link href="/companion" className="mobile-bar-brand"><Image src="/tagvico-icon.png" alt="" width={28} height={28} /><span>Tagvico</span></Link>
      <MemberAvatarStack members={stackMembers} size={24} max={3} />
      <button type="button" className="mobile-bar-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-sheet" onClick={() => setMenuOpen((value) => !value)}>
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
    </header>
    {menuOpen ? <button type="button" className="mobile-sheet-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
    <div className="mobile-sheet" id="mobile-sheet" role="dialog" aria-label="Menu" hidden={!menuOpen}>
      <p className="mobile-sheet-household"><strong>{household?.household.name || workspaceName}</strong><small>{household ? `${household.members.length} ${household.members.length === 1 ? 'person' : 'people'}` : ''}</small></p>
      {household && household.members.length > 0 ? <section aria-label="People"><p className="sidebar-section-title">People</p><PeopleList household={household} pathname={pathname} /></section> : null}
      {household ? <section aria-label="Channels"><p className="sidebar-section-title">Channels</p><ChannelList channels={household.channels} /></section> : null}
      <section aria-label="More">
        <p className="sidebar-section-title">More</p>
        <ul className="sidebar-people">
          {visibleMoreLinks.map(({ href, label, Icon }) => <li key={href}>
            <Link href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined}>
              <Icon className="nav-icon" aria-hidden="true" /><span>{label}</span>
              {href === '/automation' && recoveryTotal > 0 ? <span className="nav-badge nav-badge-total" aria-label={`${recoveryTotal} recovery items`}>{recoveryTotal}</span> : null}
            </Link>
          </li>)}
          {household?.paperlessUrl ? <li><a href={household.paperlessUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="nav-icon" aria-hidden="true" /><span>Open Paperless</span></a></li> : null}
          <li><a href="/docs/"><BookOpen className="nav-icon" aria-hidden="true" /><span>Docs</span></a></li>
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
        <MemberAvatarStack members={stackMembers} size={26} />
        <span className="household-card-copy">
          <strong>{household?.household.name || workspaceName}</strong>
          <small>{household ? `${household.members.length} ${household.members.length === 1 ? 'person' : 'people'}` : 'Household'}</small>
        </span>
      </Link>
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

        {household && household.members.length > 0 ? <nav className="sidebar-section" aria-label="People">
          <p className="sidebar-section-title nav-copy">People</p>
          <PeopleList household={household} pathname={pathname} />
        </nav> : null}

        {household ? <section className="sidebar-section" aria-label="Channels">
          <p className="sidebar-section-title nav-copy">Channels</p>
          <ChannelList channels={household.channels} />
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
          <a href="/docs/" title="Documentation"><BookOpen className="nav-icon" aria-hidden="true" /><span className="nav-copy">Docs</span></a>
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
    <main className="main">{children}</main>

    <nav className="mobile-tabs" aria-label="Primary">
      {([['/companion', 'Ask', Sparkles], ['/inbox', 'Needs you', Inbox], ['/documents', 'Documents', FileText], ['/settings', 'Settings', Settings]] as const).map(([href, label, Icon]) =>
        <Link key={href} href={href} className={isCurrent(pathname, href) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined}>
          <Icon aria-hidden="true" /><span>{label}</span>
          {href === '/inbox' ? <NeedsBadge count={needsYou} overdue={overdue} /> : null}
        </Link>)}
    </nav>
  </div>;
}
