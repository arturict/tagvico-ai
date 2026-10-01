'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Stamp, SquarePen, Tags, X
} from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import type { HouseholdNavigation } from '@/lib/server/household-navigation';
import { SidebarContent, type SidebarModel } from '@/components/shell/sidebar-content';
import { listedSessions, type ChatSession } from '@/components/shell/chat-sessions';
import { NEW_CHAT_HREF, pageTitle } from '@/components/shell/routes';
import { useChatSessions } from '@/components/shell/use-chat-sessions';
import { DocumentTitle } from '@/components/shell/document-title';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { shortcutAction } from '@/components/shell/shortcuts';
import { ToastProvider } from '@/components/ui/toast';

// Links in the account menu; the first two depend on the write mode and the member's role.
const moreLinks = [
  { href: '/review', label: 'Review queue', Icon: Stamp },
  { href: '/tags', label: 'Organize tags', Icon: Tags },
  { href: '/activity', label: 'Activity', Icon: Activity },
  { href: '/automation', label: 'Overview', Icon: LayoutDashboard }
] as const;

const PEOPLE_OPEN_KEY = 'tagvicoPeopleOpen';
const COLLAPSED_KEY = 'tagvicoSidebarCollapsed';

function roleLabel(role: string) {
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
}

export function AppNavigationShell({ children, username, workspaceRole, initialWriteMode, initialNavigation, initialSessions }: {
  children: React.ReactNode;
  username: string;
  workspaceRole: string;
  initialWriteMode: 'review' | 'automatic';
  initialNavigation?: HouseholdNavigation;
  initialSessions: ChatSession[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [writeMode, setWriteMode] = useState(initialWriteMode);
  const [recoveryCounts, setRecoveryCounts] = useState({ failed: 0, ignored: 0 });
  const [household, setHousehold] = useState<HouseholdNavigation | undefined>(initialNavigation);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuWasOpen = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeChatId = pathname === '/companion' ? searchParams.get('chat') || '' : '';
  // Any change of page or open chat reloads the chat list and closes the drawer.
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const chats = useChatSessions(initialSessions, routeKey);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true');
    setPeopleOpen(window.localStorage.getItem(PEOPLE_OPEN_KEY) === 'true');
  }, []);

  const togglePeople = useCallback((next: boolean) => {
    setPeopleOpen(next);
    window.localStorage.setItem(PEOPLE_OPEN_KEY, String(next));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [routeKey]);

  // Ctrl/Cmd+Shift+O starts a new chat from any page, as in ChatGPT.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutAction(event, event.target as Element | null) !== 'new-chat') return;
      event.preventDefault();
      router.push(NEW_CHAT_HREF);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  // The drawer behaves as a modal dialog: focus moves into it, Tab cycles inside it, Escape closes it
  // and focus returns to the menu button. Keys pressed inside an open menu belong to that menu.
  useEffect(() => {
    if (!menuOpen) {
      if (menuWasOpen.current) menuButtonRef.current?.focus();
      menuWasOpen.current = false;
      return;
    }
    menuWasOpen.current = true;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest?.('[role="menu"]')) return;
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const inside = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') || [])
        .filter((element) => element.offsetParent !== null);
      if (!inside.length) return;
      const index = inside.indexOf(document.activeElement as HTMLElement);
      // Focus on the drawer itself (index -1) enters the list at its first or last control.
      const next = index === -1
        ? (event.shiftKey ? inside[inside.length - 1] : inside[0])
        : event.shiftKey
          ? inside[index === 0 ? inside.length - 1 : index - 1]
          : inside[index === inside.length - 1 ? 0 : index + 1];
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
        const counts = await fetchJson<{ failed?: number; ignored?: number }>('/api/navigation/counts');
        if (active) setRecoveryCounts({
          failed: Number(counts.failed) || 0,
          ignored: Number(counts.ignored) || 0
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

  // The chat page renders the open chat's title and messages on the server: renaming it refreshes that page,
  // and deleting it leaves for a new chat instead of a page about a chat that no longer exists.
  const renameChat = async (id: string, title: string) => {
    await chats.rename(id, title);
    if (id === activeChatId) router.refresh();
  };
  const removeChat = async (id: string) => {
    await chats.remove(id);
    if (id === activeChatId) router.push(NEW_CHAT_HREF);
  };

  const toggleCollapsed = () => setCollapsed((value) => {
    window.localStorage.setItem(COLLAPSED_KEY, String(!value));
    return !value;
  });

  const me = household?.members.find((member) => member.id === household.currentMemberId);
  const accountLinks = moreLinks.filter(({ href }) =>
    (href !== '/review' || writeMode === 'review')
    && (href !== '/tags' || workspaceRole === 'owner')
  );

  const model: SidebarModel = {
    pathname,
    household,
    needsYou: household?.needsYouCount || 0,
    overdue: household?.overdueCount || 0,
    recoveryTotal: recoveryCounts.failed + recoveryCounts.ignored,
    accountLinks: [...accountLinks],
    account: { name: me?.displayName || username, memberId: me?.id || username, role: roleLabel(workspaceRole) },
    peopleOpen,
    onTogglePeople: togglePeople,
    chats: {
      sessions: listedSessions(chats.sessions, activeChatId),
      failed: chats.failed,
      activeId: activeChatId,
      rename: renameChat,
      remove: removeChat
    }
  };

  return <ToastProvider><div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
    <DocumentTitle needsCount={model.needsYou} onNeedsYouPage={Boolean(household) && pathname === '/inbox'} />
    <OfflineBanner />

    <header className="mobile-bar" inert={menuOpen || undefined}>
      <button ref={menuButtonRef} type="button" className="mobile-bar-menu btn btn-ghost btn-icon btn-40" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mobile-sheet" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" />
      </button>
      <p className="mobile-bar-title type-section">{pageTitle(pathname, household?.members)}</p>
      <Link href={NEW_CHAT_HREF} className="btn btn-ghost btn-icon btn-40" aria-label="New chat"><SquarePen aria-hidden="true" /></Link>
    </header>
    {menuOpen ? <div className="mobile-sheet-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} /> : null}
    {/* A tap on any link inside the drawer, including the account menu that opens above it, ends the visit to the drawer. */}
    <div ref={sheetRef} tabIndex={-1} className="mobile-sheet" id="mobile-sheet" role="dialog" aria-modal="true" aria-label="Menu" hidden={!menuOpen}
      onClick={(event) => { if ((event.target as Element).closest('a[href]')) setMenuOpen(false); }}>
      <div className="sidebar-head">
        <Link href="/companion" className="sidebar-brand"><Image src="/tagvico-icon.png" alt="" width={24} height={24} /><span className="type-section">Tagvico</span></Link>
        <button type="button" className="btn btn-ghost btn-icon btn-40" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X aria-hidden="true" /></button>
      </div>
      <SidebarContent model={model} variant="sheet" collapsed={false} />
    </div>
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <Link href="/companion" className="sidebar-brand shell-copy"><Image src="/tagvico-icon.png" alt="" width={24} height={24} /><span className="type-section">Tagvico</span></Link>
          <button className="sidebar-toggle btn btn-ghost btn-icon btn-32" type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
        <SidebarContent model={model} variant="sidebar" collapsed={collapsed} />
      </div>
    </aside>
    <main className="main" inert={menuOpen || undefined}>{children}</main>
  </div></ToastProvider>;
}
