import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { getHouseholdNavigation } from '@/lib/server/household-navigation';
import { AppNavigationShell } from '@/components/app-navigation-shell';
import settingsV3Service from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const settings = await settingsV3Service.getSettings();
  const navigation = await getHouseholdNavigation(user);
  return <AppNavigationShell
    workspaceName={workspace.name}
    userLabel={`${user.username} · ${workspace.role}`}
    workspaceRole={workspace.role}
    initialWriteMode={settings.automation.writeMode}
    initialNavigation={navigation}
  >
    {children}
  </AppNavigationShell>;
}
