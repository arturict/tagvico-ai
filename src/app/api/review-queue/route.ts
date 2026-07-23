import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';

// The durable queue remains a CommonJS backend service shared with Express.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reviewService = require('../../../../services/reviewService') as {
  listPendingSuggestions(limit?: number): Promise<unknown[]>;
  isReviewModeEnabled(): boolean;
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireApiUser();
    return Response.json({
      suggestions: await reviewService.listPendingSuggestions(100),
      reviewMode: reviewService.isReviewModeEnabled(),
      canMutate: workspaceFor(user).role !== 'viewer'
    });
  } catch (error) {
    return apiError(error instanceof ApiError ? error : new ApiError(500, 'The review queue is unavailable.'));
  }
}
