import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { AppNavigationShell } from '@/components/app-navigation-shell';
import settingsV3Service from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const settings = await settingsV3Service.getSettings();
  return <AppNavigationShell
    workspaceName={workspace.name}
    userLabel={`${user.username} · ${workspace.role}`}
    initialWriteMode={settings.automation.writeMode}
  >
    {children}
  </AppNavigationShell>;
}
