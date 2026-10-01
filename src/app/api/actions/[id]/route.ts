import { revalidatePath } from 'next/cache';
import { assertCanMutateWorkspace, assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';

const sync = require('../../../../../services/actionSyncService') as typeof import('../../../../../services/actionSyncService');

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const { id } = await params;
    const item = actionCenter.getCase(workspace.householdId, id);
    if (!item) throw new ApiError(404, 'Action case not found');
    return Response.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    assertCanMutateWorkspace(workspace.role);
    const { id } = await params;
    if (!actionCenter.getCase(workspace.householdId, id)) throw new ApiError(404, 'Action case not found');
    actionCenter.updateCase(workspace.householdId, id, workspace.memberId, await readJsonBody(request));
    try {
      await sync.pushCase(workspace.householdId, id, workspace.memberId);
    } catch {
      // The change is saved; the failed sync is persisted on the case and returned as syncStatus/syncError.
    }
    const item = actionCenter.getCase(workspace.householdId, id);
    revalidatePath(`/actions/${id}`);
    revalidatePath('/actions');
    revalidatePath('/inbox');
    return Response.json(item);
  } catch (error) {
    return apiError(error);
  }
}
