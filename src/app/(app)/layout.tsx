import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { AppNavigationShell } from '@/components/app-navigation-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  return <AppNavigationShell workspaceName={workspace.name} userLabel={`${user.username} · ${workspace.role}`}>
    {children}
  </AppNavigationShell>;
}
