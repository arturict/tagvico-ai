import {
  assertCanMutateWorkspace,
  assertSameOrigin,
  apiError,
  ApiError,
  readJsonBody,
  requireApiUser
} from '@/lib/server/auth';
import { manualBackendRequest } from '@/lib/server/manual-backend';
import { workspaceFor } from '@/lib/server/workspace';

type AnalyzeBody = {
  content?: unknown;
  existingTags?: unknown;
  id?: unknown;
};

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    assertCanMutateWorkspace(workspaceFor(user).role);
    const body = await readJsonBody<AnalyzeBody>(request, 2 * 1024 * 1024);
    const content = typeof body.content === 'string' ? body.content : '';
    const id = Number(body.id);
    if (!content.trim()) throw new ApiError(400, 'Document content is required.');
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, 'A valid document id is required.');
    const existingTags = Array.isArray(body.existingTags)
      ? body.existingTags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 500)
      : [];

    return await manualBackendRequest(request, '/manual/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, id, existingTags })
    }, 120_000);
  } catch (error) {
    return apiError(error);
  }
}
