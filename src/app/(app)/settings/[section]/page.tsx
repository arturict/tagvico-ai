import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';
import type { SettingsResponse, SettingsSectionId } from '@/components/settings/types';

const settingsV3Module = require('@root/services/settingsV3Service');
const settingsV3Service = settingsV3Module.default || settingsV3Module;

const validSections = new Set<SettingsSectionId>([
  'general',
  'paperless',
  'providers',
  'automation',
  'tags',
  'security',
  'diagnostics'
]);

export const dynamic = 'force-dynamic';

const sectionTitles: Record<string, string> = {
  general: 'Household',
  paperless: 'Paperless',
  providers: 'AI models',
  automation: 'Automation settings',
  tags: 'Tag library',
  security: 'Security & privacy',
  diagnostics: 'Diagnostics'
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: sectionTitles[section] || 'Settings' };
}

export default async function SettingsSectionPage({
  params
}: {
  params: Promise<{ section: string }>;
}) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { section } = await params;
  if (!validSections.has(section as SettingsSectionId)) notFound();
  if (workspace.role !== 'owner' && section !== 'general') redirect('/settings/general');
  const initialSettings = await settingsV3Service.getSettings() as SettingsResponse;
  const members = actionCenter.listMembers(workspace.householdId);
  return <SettingsWorkspace
    section={section as SettingsSectionId}
    initialSettings={JSON.parse(JSON.stringify(initialSettings))}
    household={{
      currentMemberId: workspace.memberId,
      currentRole: workspace.role,
      householdKind: workspace.kind,
      members: JSON.parse(JSON.stringify(members))
    }}
  />;
}
