import { ApiError, apiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import paperlessIdentityService from '@root/services/paperlessIdentityService';
import { getEffectiveProviderEnvironment } from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

/** Paperless users that a household profile can be linked to. Owner only. */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can list Paperless users.');
    const environment = await getEffectiveProviderEnvironment();
    const users = await paperlessIdentityService.listPaperlessUsers(
      String(environment.PAPERLESS_API_URL || ''),
      String(environment.PAPERLESS_API_TOKEN || '')
    );
    return Response.json({ available: users !== null, users: users || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
