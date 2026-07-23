'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, Gauge, History, ListChecks, LogOut, Settings, Sparkles, Stamp } from 'lucide-react';

const links = [
  { href: '/actions', label: 'Actions', description: 'Tasks and deadlines from documents', Icon: ListChecks },
  { href: '/companion', label: 'Ask Tagvico', description: 'Research your Paperless archive', Icon: Sparkles },
  { href: '/automation', label: 'Automation', description: 'Scan and organize documents', Icon: Gauge },
  { href: '/review', label: 'Review queue', description: 'Approve suggested changes', Icon: Stamp },
  { href: '/activity', label: 'Activity', description: 'See, restore or re-run changes', Icon: History },
  { href: '/settings', label: 'Settings', description: 'Connections, models and access', Icon: Settings }
] as const;

export function AppNavigationShell({ children, workspaceName, userLabel }: {
  children: React.ReactNode;
  workspaceName: string;
  userLabel: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('tagvicoSidebarCollapsed') === 'true');
  }, []);

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
        {links.map(({ href, label, description, Icon }) => <Link key={href} href={href} className={pathname === href || pathname.startsWith(`${href}/`) ? 'is-active' : undefined} aria-current={pathname === href ? 'page' : undefined} title={collapsed ? `${label} — ${description}` : description}>
          <Icon className="nav-icon" aria-hidden="true" />
          <span className="nav-copy">{label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-utility-links">
          <a href="/docs/" title="Documentation"><BookOpen className="nav-icon" aria-hidden="true" /><span className="nav-copy">Documentation</span></a>
          <a href="/logout" title="Sign out"><LogOut className="nav-icon" aria-hidden="true" /><span className="nav-copy">Sign out</span></a>
        </div>
        <div className="sidebar-identity nav-copy"><div>{workspaceName}</div><div>{userLabel}</div></div>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
