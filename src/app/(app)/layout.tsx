import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { getHouseholdNavigation } from '@/lib/server/household-navigation';
import { AppNavigationShell } from '@/components/app-navigation-shell';
import { parseSessions } from '@/components/shell/chat-sessions';
import settingsV3Service from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const settings = await settingsV3Service.getSettings();
  const navigation = await getHouseholdNavigation(user);
  // The sidebar history starts from the same rows GET /api/companion/sessions returns, so it paints without a flash.
  const sessions = parseSessions(actionCenter.listSessions(workspace.householdId, workspace.memberId, 'web'));
  return <AppNavigationShell
    username={user.username}
    workspaceRole={workspace.role}
    initialWriteMode={settings.automation.writeMode}
    initialNavigation={navigation}
    initialSessions={sessions}
  >
    {children}
  </AppNavigationShell>;
}
