import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { listSessionApprovals } from '@/lib/server/agent/session-approvals';

export const dynamic = 'force-dynamic';

/** Proposals of one of the member's own conversations, including decided ones. */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const sessionId = new URL(request.url).searchParams.get('sessionId')?.trim() || '';
    if (!sessionId) throw new ApiError(400, 'A companion session is required');
    const session = actionCenter.getSession(workspace.householdId, sessionId) as { member_id?: unknown } | null;
    if (!session || session.member_id !== workspace.memberId) throw new ApiError(404, 'Companion session not found');
    return Response.json({
      approvals: listSessionApprovals(workspace.householdId, sessionId)
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
