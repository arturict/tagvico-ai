import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '../../../../services/backendProxyAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
    const response = await fetch(`${backend}/api/review-queue`, {
      headers: backendBearerHeaders(request),
      cache: 'no-store',
      redirect: 'manual'
    });
    if (!response.ok) {
      throw new ApiError(response.status >= 500 ? 502 : response.status, 'The review queue is unavailable.');
    }
    const queue = await response.json() as { suggestions?: unknown[]; reviewMode?: boolean };
    return Response.json({
      suggestions: queue.suggestions || [],
      reviewMode: Boolean(queue.reviewMode),
      canMutate: ['owner', 'adult'].includes(workspaceFor(user).role)
    });
  } catch (error) {
    console.error('[review-queue] Could not list pending suggestions:', error);
    return apiError(error instanceof ApiError ? error : new ApiError(500, 'The review queue is unavailable.'));
  }
}
