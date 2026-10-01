import {
  assertCanMutateWorkspace,
  assertSameOrigin,
  apiError,
  ApiError,
  readJsonBody,
  requireApiUser
} from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '../../../../../services/backendProxyAuth';

type DecisionBody = { action?: 'apply' | 'reject'; note?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    assertCanMutateWorkspace(workspaceFor(user).role);
    // Applying a suggestion writes to Paperless, so it follows the same rule as approvals.
    if (!['owner', 'adult'].includes(workspaceFor(user).role)) {
      throw new ApiError(403, 'Only an owner or adult can apply or reject suggestions');
    }
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ error: 'A valid suggestion id is required.' }, { status: 400 });
    }
    const body = await readJsonBody<DecisionBody>(request);
    if (body.action !== 'apply' && body.action !== 'reject') {
      return Response.json({ error: 'Action must be apply or reject.' }, { status: 400 });
    }
    const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
    const response = await fetch(`${backend}/review/${id}/${body.action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...backendBearerHeaders(request)
      },
      body: JSON.stringify(body.action === 'reject' ? { note: String(body.note || '').trim() || null } : {}),
      cache: 'no-store',
      redirect: 'manual'
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return apiError(error instanceof ApiError ? error : new ApiError(500, 'The review decision failed.'));
  }
}
