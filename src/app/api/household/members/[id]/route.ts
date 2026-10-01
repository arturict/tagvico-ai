import { assertSameOrigin, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import channelSettingsService from '@root/services/channelSettingsService';
import householdMembersService from '@root/services/householdMembersService';
import { settingsErrorResponse } from '../../../settings/error-response';

export const dynamic = 'force-dynamic';

/** Rename a profile or change its role. Owners only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const workspace = workspaceFor(await requireApiUser());
    const { id } = await params;
    const { displayName, role } = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
    const member = householdMembersService.updateMember(
      workspace.householdId,
      workspace.memberId,
      id,
      { displayName, role }
    );
    return Response.json(member, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

/** Remove a profile. Owners only; the owner and web sign-ins stay. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const workspace = workspaceFor(await requireApiUser());
    const { id } = await params;
    const removed = await householdMembersService.removeMemberAndChannelAccess(
      workspace.householdId,
      workspace.memberId,
      id,
      (memberId) => channelSettingsService.removeMemberFromChannels(workspace.householdId, memberId)
    );
    return Response.json({ ok: true, ...removed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
