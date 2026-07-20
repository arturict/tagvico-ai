import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { runtimeConfiguration } from '@/lib/server/agent/credential-store';
import { SettingsPanel } from '@/components/settings-panel';
import codexService from '../../../../services/codexService';

export const dynamic = 'force-dynamic';
export default async function SettingsPage() {
  const user = await requireUser(); const workspace = workspaceFor(user); const runtime = runtimeConfiguration();
  const codexStatus = await codexService.getStatus();
  const members = actionCenter.listMembers(workspace.householdId);
  return <div className="page"><header className="page-head"><div><p className="eyebrow">Installation & access</p><h1>Household & models</h1><p className="lede">Tagvico owns sessions, permissions and approvals. Providers supply intelligence—not control.</p></div></header><SettingsPanel householdId={workspace.householdId} currentMemberId={workspace.memberId} currentRole={workspace.role} householdKind={workspace.kind} runtime={{ provider: runtime.provider, model: runtime.model }} codexStatus={codexStatus} members={JSON.parse(JSON.stringify(members))} /></div>;
}
