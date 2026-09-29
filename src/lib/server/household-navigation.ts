import 'server-only';
import type { SessionUser } from './auth';
import { actionCenter, workspaceFor } from './workspace';
import documentModel from '@root/models/document';
import settingsV3Service from '@root/services/settingsV3Service';
import { runtimeEnvironmentValue } from '@root/services/runtimeEnvironment';

export type ChannelState = 'connected' | 'needs-setup' | 'off';

export interface HouseholdNavigation {
  household: { name: string; kind: string };
  currentMemberId: string;
  members: Array<{ id: string; displayName: string; role: string; openCount: number }>;
  needsYouCount: number;
  channels: { telegram: ChannelState; discord: ChannelState };
  paperlessUrl: string | null;
}

const ACTIVE_CASE = `status IN ('suggested','open','waiting')`;

function truthy(value: string) {
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

// Only whether a token exists is reported; the value never leaves this module.
function channelState(enabledKey: string, tokenKey: string): ChannelState {
  if (!truthy(runtimeEnvironmentValue(enabledKey))) return 'off';
  return runtimeEnvironmentValue(tokenKey) ? 'connected' : 'needs-setup';
}

async function paperlessUrl(): Promise<string | null> {
  try {
    const settings = await settingsV3Service.getSettings();
    const url = String(settings.paperless.baseUrl || '').trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

export async function getHouseholdNavigation(user: SessionUser): Promise<HouseholdNavigation> {
  const workspace = workspaceFor(user);
  const db = documentModel.getDatabase();
  const openByMember = new Map<string, number>();
  for (const row of db.prepare(
    `SELECT assignee_member_id AS id, COUNT(*) AS total FROM action_cases
     WHERE household_id = ? AND ${ACTIVE_CASE} AND assignee_member_id IS NOT NULL GROUP BY assignee_member_id`
  ).all(workspace.householdId) as Array<{ id: string; total: number }>) openByMember.set(row.id, Number(row.total));

  const members = (actionCenter.listMembers(workspace.householdId) as Array<Record<string, unknown>>).map((member) => ({
    id: String(member.id),
    displayName: String(member.display_name),
    role: String(member.role),
    openCount: openByMember.get(String(member.id)) || 0
  }));

  const canDecide = ['owner', 'adult'].includes(workspace.role);
  const pendingApprovals = canDecide
    ? Number((db.prepare(`SELECT COUNT(*) AS total FROM agent_approvals WHERE household_id = ? AND status = 'pending'`)
      .get(workspace.householdId) as { total: number }).total)
    : 0;
  const dueSoon = Number((db.prepare(
    `SELECT COUNT(*) AS total FROM action_cases
     WHERE household_id = ? AND assignee_member_id = ? AND ${ACTIVE_CASE}
       AND due_at IS NOT NULL AND date(due_at) <= date('now', '+7 days')`
  ).get(workspace.householdId, workspace.memberId) as { total: number }).total);

  let pendingReview = 0;
  if (canDecide) {
    try {
      pendingReview = Number((db.prepare(`SELECT COUNT(*) AS total FROM review_suggestions WHERE status = 'pending'`).get() as { total: number }).total);
    } catch {
      // The review table only exists once review mode has staged a suggestion.
    }
  }

  return {
    household: { name: workspace.name, kind: workspace.kind },
    currentMemberId: workspace.memberId,
    members,
    needsYouCount: pendingApprovals + dueSoon + pendingReview,
    channels: {
      telegram: channelState('TELEGRAM_BOT_ENABLED', 'TELEGRAM_BOT_TOKEN'),
      discord: channelState('DISCORD_BOT_ENABLED', 'DISCORD_BOT_TOKEN')
    },
    paperlessUrl: await paperlessUrl()
  };
}
