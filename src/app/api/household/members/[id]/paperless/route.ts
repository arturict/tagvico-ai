import { assertSameOrigin, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import channelSettingsService from '@root/services/channelSettingsService';
import householdMembersService from '@root/services/householdMembersService';
import paperlessIdentityService from '@root/services/paperlessIdentityService';
import { encryptSecret } from '@root/services/secretBox';
import { getEffectiveProviderEnvironment } from '@root/services/settingsV3Service';
import { settingsErrorResponse } from '../../../../settings/error-response';

export const dynamic = 'force-dynamic';

/**
 * Sets a profile's Paperless token and linked Paperless user. Owners manage
 * every profile; anyone else only their own. A new token must be accepted by
 * Paperless, and its owner is linked automatically unless a user is chosen.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const workspace = workspaceFor(await requireApiUser());
    const { id } = await params;
    if (id !== workspace.memberId && workspace.role !== 'owner') {
      throw new ApiError(403, 'You cannot change this profile\'s Paperless access.');
    }
    const member = actionCenter.getMemberSecretRecord(workspace.householdId, id);
    if (!member) throw new ApiError(404, 'This profile no longer exists.');
    const { token, removeToken, paperlessUserId } = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const cleanToken = String(token || '').trim();
    const environment = await getEffectiveProviderEnvironment();
    const paperlessUrl = String(environment.PAPERLESS_API_URL || '');

    let parsedUserId: number | null | undefined;
    if (paperlessUserId === null) parsedUserId = null;
    else if (paperlessUserId !== undefined && paperlessUserId !== '') {
      parsedUserId = Number(paperlessUserId);
      if (!Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) {
        throw new ApiError(400, 'Choose a Paperless user from the list or enter a positive number.');
      }
    }

    let encryptedToken: string | null | undefined;
    if (cleanToken) {
      const check = await paperlessIdentityService.checkPaperlessToken(paperlessUrl, cleanToken);
      if (!check.ok) {
        return Response.json({ error: check.message, field: 'token' }, { status: check.reason === 'rejected' ? 400 : 502 });
      }
      encryptedToken = encryptSecret(cleanToken);
      if (parsedUserId === undefined && check.user) parsedUserId = check.user.id;
    } else if (removeToken === true) {
      encryptedToken = null;
    }

    if (parsedUserId) {
      const users = await paperlessIdentityService.listPaperlessUsers(paperlessUrl, String(environment.PAPERLESS_API_TOKEN || ''));
      if (users && !users.some((user) => user.id === parsedUserId)) {
        return Response.json({ error: 'Paperless has no user with this ID.', field: 'paperlessUserId' }, { status: 400 });
      }
    }

    actionCenter.setPaperlessToken(workspace.householdId, id, encryptedToken, parsedUserId);
    if (encryptedToken !== undefined) {
      await channelSettingsService.refreshMemberCredentials(workspace.householdId, id);
    }
    const updated = householdMembersService.listMembers(workspace.householdId).find((entry) => entry.id === id);
    return Response.json({ ok: true, member: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
