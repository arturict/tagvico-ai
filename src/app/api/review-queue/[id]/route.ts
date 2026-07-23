import {
  assertCanMutateWorkspace,
  assertSameOrigin,
  apiError,
  ApiError,
  readJsonBody,
  requireApiUser
} from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';

// The durable queue remains a CommonJS backend service shared with Express.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reviewService = require('../../../../../services/reviewService') as {
  applySuggestion(id: number, actor?: string | null): Promise<{ ok: boolean; reason?: string; status?: number }>;
  rejectSuggestion(id: number, actor?: string | null, note?: string | null): Promise<{ ok: boolean; reason?: string; status?: number }>;
};

type DecisionBody = { action?: 'apply' | 'reject'; note?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    assertCanMutateWorkspace(workspaceFor(user).role);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ error: 'A valid suggestion id is required.' }, { status: 400 });
    }
    const body = await readJsonBody<DecisionBody>(request);
    const actor = `web:${user.username}`;
    const result = body.action === 'apply'
      ? await reviewService.applySuggestion(id, actor)
      : body.action === 'reject'
        ? await reviewService.rejectSuggestion(id, actor, String(body.note || '').trim() || null)
        : { ok: false, reason: 'Action must be apply or reject.', status: 400 };
    return Response.json(result, { status: result.ok ? 200 : (result.status || 409) });
  } catch (error) {
    return apiError(error instanceof ApiError ? error : new ApiError(500, 'The review decision failed.'));
  }
}
