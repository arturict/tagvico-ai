import {
  assertSameOrigin,
  apiError,
  ApiError,
  readJsonBody,
  requireApiUser
} from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const body = await readJsonBody<{ title?: unknown }>(request, 8 * 1024);
    const title = String(body.title || '').trim();
    if (!title) throw new ApiError(400, 'A conversation title is required');
    const { sessionId } = await params;
    actionCenter.renameSession(workspace.householdId, workspace.memberId, sessionId, title);
    return Response.json({ success: true, title });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const { sessionId } = await params;
    actionCenter.deleteSession(workspace.householdId, workspace.memberId, sessionId);
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
