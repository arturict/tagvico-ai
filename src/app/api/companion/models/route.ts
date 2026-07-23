import {
  companionModelSelectionSchema,
  type CompanionModelSelection
} from '@root/contracts/companion';
import companionModelService from '@root/services/companionModelService';
import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';

function ownedSession(
  householdId: string,
  memberId: string,
  sessionId: string
) {
  const session = actionCenter.getSession(householdId, sessionId) as { member_id?: unknown } | null;
  if (!session || session.member_id !== memberId) {
    throw new ApiError(404, 'Companion session not found');
  }
  return session;
}

function requestedSessionId(request: Request) {
  return new URL(request.url).searchParams.get('sessionId')?.trim() || '';
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const sessionId = requestedSessionId(request);
    if (!sessionId) throw new ApiError(400, 'A companion session is required');
    ownedSession(workspace.householdId, workspace.memberId, sessionId);
    const catalog = await companionModelService.getCompanionModelCatalog(
      new URL(request.url).searchParams.get('refresh') === '1'
    );
    const stored = actionCenter.getCompanionModelSelection(
      workspace.householdId,
      sessionId
    ) as CompanionModelSelection | null;
    const selection = companionModelService.selectionIsAvailable(catalog, stored)
      ? stored
      : catalog.defaultSelection;
    return Response.json({ ...catalog, selection }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId) throw new ApiError(400, 'A companion session is required');
    ownedSession(workspace.householdId, workspace.memberId, sessionId);
    const parsed = companionModelSelectionSchema.safeParse(body.selection);
    if (!parsed.success) throw new ApiError(400, 'Choose a valid provider and model');
    const catalog = await companionModelService.getCompanionModelCatalog();
    if (!companionModelService.selectionIsAvailable(catalog, parsed.data)) {
      throw new ApiError(409, 'That model is no longer available from the configured provider');
    }
    const selection = actionCenter.setCompanionModelSelection(
      workspace.householdId,
      sessionId,
      workspace.memberId,
      parsed.data
    );
    return Response.json({ selection }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}
