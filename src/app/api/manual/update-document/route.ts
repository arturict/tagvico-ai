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

type UpdateBody = {
  documentId?: unknown;
  tags?: unknown;
  correspondent?: unknown;
  documentType?: unknown;
  title?: unknown;
  ownerId?: unknown;
};

const optionalText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    assertCanMutateWorkspace(workspaceFor(user).role);
    const body = await readJsonBody<UpdateBody>(request);
    const documentId = Number(body.documentId);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new ApiError(400, 'A valid document id is required.');
    }
    const ownerId = body.ownerId === null || body.ownerId === '' || body.ownerId === undefined
      ? null
      : Number(body.ownerId);
    if (ownerId !== null && (!Number.isSafeInteger(ownerId) || ownerId <= 0)) {
      throw new ApiError(400, 'Owner must be a valid Paperless user id.');
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 500)
      : [];

    return await manualBackendRequest(request, '/manual/updateDocument', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        tags,
        correspondent: optionalText(body.correspondent, 500),
        documentType: optionalText(body.documentType, 500),
        title: optionalText(body.title, 1000),
        ownerId
      })
    }, 60_000);
  } catch (error) {
    return apiError(error);
  }
}
