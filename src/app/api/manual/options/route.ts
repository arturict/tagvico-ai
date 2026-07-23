import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';

// This CommonJS service is bundled into the Next server route.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paperlessService = require('../../../../../services/paperlessService') as {
  listCorrespondentsNames(): Promise<Array<{ id?: number; name?: string }>>;
  listDocumentTypesNames(): Promise<Array<{ id?: number; name?: string }>>;
  getUsers(): Promise<Array<{ id?: number; username?: string }>>;
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireApiUser();
    const [correspondents, documentTypes, users] = await Promise.all([
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames(),
      paperlessService.getUsers()
    ]);
    return Response.json({
      correspondents: correspondents.map(({ id, name }) => ({ id, name })),
      documentTypes: documentTypes.map(({ id, name }) => ({ id, name })),
      users: users.map(({ id, username }) => ({ id, username })),
      canMutate: workspaceFor(user).role !== 'viewer'
    });
  } catch (error) {
    return apiError(error instanceof ApiError ? error : new ApiError(502, 'Paperless options are unavailable.'));
  }
}
