import Link from 'next/link';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  return <div className="shell">
    <aside className="sidebar">
      <Link href="/actions" className="brand"><span className="brand-mark">T</span><span>Tagvico</span></Link>
      <nav className="nav" aria-label="Main navigation">
        <Link href="/actions">Action center</Link>
        <Link href="/companion">Companion</Link>
        <Link href="/settings">Household & models</Link>
        <Link href="/dashboard">Document automation</Link>
        <Link href="/automation/settings">Automation settings</Link>
      </nav>
      <div className="sidebar-foot"><div>{workspace.name}</div><div>{user.username} · {workspace.role}</div></div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
