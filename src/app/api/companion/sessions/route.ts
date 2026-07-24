import { assertSameOrigin, apiError, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    return Response.json({
      sessions: actionCenter.listSessions(workspace.householdId, workspace.memberId, 'web')
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    const sessionId = actionCenter.createSession(workspace.householdId, workspace.memberId, 'web');
    return Response.json({ sessionId }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}
