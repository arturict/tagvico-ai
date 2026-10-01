import { assertSameOrigin, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import householdMembersService from '@root/services/householdMembersService';
import { settingsErrorResponse } from '../../settings/error-response';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const workspace = workspaceFor(await requireApiUser());
    const { displayName, role } = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
    const member = householdMembersService.addMember(workspace.householdId, workspace.memberId, { displayName, role });
    return Response.json(member, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
