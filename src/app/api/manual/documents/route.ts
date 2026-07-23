import { apiError, requireApiUser } from '@/lib/server/auth';
import { manualBackendRequest } from '@/lib/server/manual-backend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireApiUser();
    return await manualBackendRequest(request, '/manual/documents', {}, 30_000);
  } catch (error) {
    return apiError(error);
  }
}
