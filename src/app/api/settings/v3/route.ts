import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import settingsV3Service, { RevisionConflictError } from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

function requireOwner(role: string) {
  if (role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can manage installation settings.');
}

export async function GET() {
  try {
    const user = await requireApiUser();
    requireOwner(workspaceFor(user).role);
    return Response.json(await settingsV3Service.getSettings(), {
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
    requireOwner(workspaceFor(user).role);
    const body = await readJsonBody(request);
    return Response.json(await settingsV3Service.patchSettings(body), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return Response.json({
        error: error instanceof Error ? error.message : 'Settings changed in another session.'
      }, { status: 409 });
    }
    return apiError(error);
  }
}
