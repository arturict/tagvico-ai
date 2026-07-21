import { apiError, requireApiUser } from '@/lib/server/auth'; import { actionCenter, workspaceFor } from '@/lib/server/workspace';
export async function GET() { try { const user = await requireApiUser(); const workspace = workspaceFor(user); return Response.json({ approvals: actionCenter.listApprovals(workspace.householdId) }); } catch (error) { return apiError(error); } }
