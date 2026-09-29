import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';
import {
  isSettingsSectionId,
  legacySettingsSections,
  settingsSectionTitles
} from '@/components/settings/sections';
import type { SettingsResponse } from '@/components/settings/types';

const settingsV3Module = require('@root/services/settingsV3Service');
const settingsV3Service = settingsV3Module.default || settingsV3Module;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: isSettingsSectionId(section) ? settingsSectionTitles[section] : 'Settings' };
}

export default async function SettingsSectionPage({
  params
}: {
  params: Promise<{ section: string }>;
}) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { section } = await params;
  if (Object.hasOwn(legacySettingsSections, section)) redirect(`/settings/${legacySettingsSections[section]}`);
  if (!isSettingsSectionId(section)) notFound();
  if (workspace.role !== 'owner' && section !== 'people') redirect('/settings/people');
  const initialSettings = await settingsV3Service.getSettings() as SettingsResponse;
  const members = actionCenter.listMembers(workspace.householdId);
  return <SettingsWorkspace
    section={section}
    initialSettings={JSON.parse(JSON.stringify(initialSettings))}
    household={{
      currentMemberId: workspace.memberId,
      currentRole: workspace.role,
      householdKind: workspace.kind,
      members: JSON.parse(JSON.stringify(members))
    }}
  />;
}
