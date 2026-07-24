'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Ban, BookOpen, Gauge, History, ListChecks, LogOut, Megaphone, Settings, Sparkles, Stamp, TriangleAlert } from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';

const links = [
  { href: '/actions', label: 'Actions', description: 'Tasks and deadlines from documents', Icon: ListChecks },
  { href: '/companion', label: 'Ask Tagvico', description: 'Research your Paperless archive', Icon: Sparkles },
  { href: '/automation', label: 'Automation', description: 'Scan and organize documents', Icon: Gauge },
  { href: '/review', label: 'Review queue', description: 'Approve suggested changes', Icon: Stamp },
  { href: '/activity', label: 'Activity', description: 'See, restore or re-run changes', Icon: History },
  { href: '/settings', label: 'Settings', description: 'Connections, models and access', Icon: Settings }
] as const;

export function AppNavigationShell({ children, workspaceName, userLabel, initialWriteMode }: {
  children: React.ReactNode;
  workspaceName: string;
  userLabel: string;
  initialWriteMode: 'review' | 'automatic';
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [writeMode, setWriteMode] = useState(initialWriteMode);
  const [recoveryCounts, setRecoveryCounts] = useState({ failed: 0, ignored: 0, ocr: 0 });
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('tagvicoSidebarCollapsed') === 'true');
  }, []);

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
    void loadCounts();
    const timer = window.setInterval(() => void loadCounts(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  const toggle = () => setCollapsed((value) => {
    window.localStorage.setItem('tagvicoSidebarCollapsed', String(!value));
    return !value;
  });

  return <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
    <aside className="sidebar">
      <Link href="/actions" className="brand"><Image className="brand-mark" src="/tagvico-icon.png" alt="" width={31} height={31} /><span className="nav-copy">Tagvico</span></Link>
      <button className="sidebar-collapse" type="button" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
        {collapsed ? '›' : '‹'}
      </button>
      <nav className="nav" aria-label="Main navigation">
        {links.filter(({ href }) => href !== '/review' || writeMode === 'review').map(({ href, label, description, Icon }) => <div className="nav-entry" key={href}>
          <Link href={href} className={pathname === href || pathname.startsWith(`${href}/`) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={collapsed ? `${label} — ${description}` : description}>
            <Icon className="nav-icon" aria-hidden="true" />
            <span className="nav-copy">{label}</span>
            {href === '/automation' && recoveryCounts.failed + recoveryCounts.ignored > 0
              ? <span className="nav-badge nav-badge-total" aria-label={`${recoveryCounts.failed + recoveryCounts.ignored} recovery items`}>{recoveryCounts.failed + recoveryCounts.ignored}</span>
              : null}
          </Link>
          {href === '/automation' ? <div className="nav-sub-links nav-copy">
            <Link href="/automation/recovery#failed-documents" title="Permanently failed documents">
              <TriangleAlert aria-hidden="true" /><span>Failed</span><span className="nav-badge">{recoveryCounts.failed}</span>
            </Link>
            <Link href="/automation/recovery#ignored-documents" title="Permanently ignored documents">
              <Ban aria-hidden="true" /><span>Ignored</span><span className="nav-badge">{recoveryCounts.ignored}</span>
            </Link>
          </div> : null}
        </div>)}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-utility-links">
          <a href="/docs/" title="Documentation"><BookOpen className="nav-icon" aria-hidden="true" /><span className="nav-copy">Documentation</span></a>
          <Link href="/changelog" title="What's new"><Megaphone className="nav-icon" aria-hidden="true" /><span className="nav-copy">What&apos;s new</span></Link>
          <a href="/logout" title="Sign out"><LogOut className="nav-icon" aria-hidden="true" /><span className="nav-copy">Sign out</span></a>
        </div>
        <div className="sidebar-identity nav-copy"><div>{workspaceName}</div><div>{userLabel}</div></div>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
