import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import tagUnificationService from '@root/services/tagUnificationService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') {
      throw new ApiError(403, 'Only the Tagvico owner can view tag-unification audit details.');
    }
    const { id } = await params;
    return Response.json(tagUnificationService.get(id), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}
