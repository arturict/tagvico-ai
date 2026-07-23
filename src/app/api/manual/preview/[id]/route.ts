import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { manualBackendRequest } from '@/lib/server/manual-backend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ApiError(400, 'A valid document id is required.');
    }
    return await manualBackendRequest(request, `/manual/preview/${id}`, {}, 30_000);
  } catch (error) {
    return apiError(error);
  }
}
