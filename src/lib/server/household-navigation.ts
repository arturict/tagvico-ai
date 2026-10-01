import 'server-only';
import type { SessionUser } from './auth';
import { actionCenter, workspaceFor } from './workspace';
import { zurichToday } from '@/components/inbox/dates';
import settingsV3Service from '@root/services/settingsV3Service';
import { runtimeEnvironmentValue } from '@root/services/runtimeEnvironment';
import channelStatusService from '@root/services/channelStatusService';

type ChannelStatus = ReturnType<typeof channelStatusService.getChannelStatuses>['telegram'];

/** What the sidebar needs of a channel; the full report (tokens never included) lives in channelStatusService. */
export interface NavigationChannel {
  state: ChannelStatus['state'];
  label: string;
}

export interface HouseholdNavigation {
  household: { name: string; kind: string };
  currentMemberId: string;
  members: Array<{ id: string; displayName: string; role: string; openCount: number }>;
  needsYouCount: number;
  overdueCount: number;
  channels: { telegram: NavigationChannel; discord: NavigationChannel };
  /** Owners configure channels in Settings; other roles only see the status. */
  canConfigureChannels: boolean;
  paperlessUrl: string | null;
}

// Same definition of "open" as the Needs you feed and the People pages.
const ACTIVE_STATUSES = new Set(['suggested', 'open', 'waiting']);

// Link target for the browser. PAPERLESS_PUBLIC_URL (optional) is for installs where the
// API address Tagvico uses is internal, for example a container hostname; otherwise the
// configured Paperless address is the one Settings and document links already use.
export async function getPaperlessPublicUrl(): Promise<string | null> {
  const explicit = runtimeEnvironmentValue('PAPERLESS_PUBLIC_URL').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(explicit)) return explicit;
  try {
    const settings = await settingsV3Service.getSettings();
    const url = String(settings.paperless.baseUrl || '').trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Everything the shell shows about the household, derived from the same rows as the
 * Needs you feed (src/components/inbox/load-inbox.ts) and the People pages, so the
 * badge and the per-person counts always equal what those pages list.
 */
export async function getHouseholdNavigation(user: SessionUser): Promise<HouseholdNavigation> {
  const workspace = workspaceFor(user);
  const today = zurichToday();

  const openByMember = new Map<string, number>();
  let openCases = 0;
  let overdueCases = 0;
  for (const item of actionCenter.listCases(workspace.householdId) as Array<Record<string, unknown>>) {
    if (!ACTIVE_STATUSES.has(String(item.status))) continue;
    openCases += 1;
    const dueDay = item.dueAt ? String(item.dueAt).slice(0, 10) : '';
    if (dueDay && dueDay < today) overdueCases += 1;
    if (item.assigneeMemberId) {
      const assignee = String(item.assigneeMemberId);
      openByMember.set(assignee, (openByMember.get(assignee) || 0) + 1);
    }
  }

  const members = (actionCenter.listMembers(workspace.householdId) as Array<Record<string, unknown>>).map((member) => ({
    id: String(member.id),
    displayName: String(member.display_name),
    role: String(member.role),
    openCount: openByMember.get(String(member.id)) || 0
  }));

  // The feed lists every pending approval to every role, so the badge counts them too.
  const pendingApprovals = (actionCenter.listApprovals(workspace.householdId) as unknown[]).length;

  const channels = channelStatusService.getChannelStatuses();

  return {
    household: { name: workspace.name, kind: workspace.kind },
    currentMemberId: workspace.memberId,
    members,
    needsYouCount: openCases + pendingApprovals,
    overdueCount: overdueCases,
    channels: {
      telegram: { state: channels.telegram.state, label: channels.telegram.label },
      discord: { state: channels.discord.state, label: channels.discord.label }
    },
    canConfigureChannels: workspace.role === 'owner',
    paperlessUrl: await getPaperlessPublicUrl()
  };
}
