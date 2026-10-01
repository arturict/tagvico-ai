import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import channelSettingsService from '@root/services/channelSettingsService';
import householdMembersService from '@root/services/householdMembersService';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';
import {
  isSettingsSectionId,
  legacySettingsSections,
  settingsSectionTitles
} from '@/components/settings/sections';
import type { ChannelSettingsView, SettingsResponse } from '@/components/settings/types';

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
  // Installation settings carry prompts, owner profiles and provider
  // configuration, so only the owner's page ever fetches or serialises them.
  const initialSettings = workspace.role === 'owner'
    ? await settingsV3Service.getSettings() as SettingsResponse
    : null;
  const members = householdMembersService.listMembers(workspace.householdId);
  const channels = section === 'automation'
    ? {
        telegram: channelSettingsService.getChannelSettings('telegram', workspace.householdId),
        discord: channelSettingsService.getChannelSettings('discord', workspace.householdId)
      } as Record<'telegram' | 'discord', ChannelSettingsView>
    : null;
  return <SettingsWorkspace
    section={section}
    initialSettings={initialSettings ? JSON.parse(JSON.stringify(initialSettings)) : null}
    channels={channels ? JSON.parse(JSON.stringify(channels)) : null}
    household={{
      currentMemberId: workspace.memberId,
      currentRole: workspace.role,
      householdKind: workspace.kind,
      members: JSON.parse(JSON.stringify(members))
    }}
  />;
}
