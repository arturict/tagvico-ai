import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import tagUnificationService from '@root/services/tagUnificationService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireOwner(role: string) {
  if (role !== 'owner') {
    throw new ApiError(403, 'Only the Tagvico owner can manage the shared Paperless tag vocabulary.');
  }
}

export async function GET() {
  try {
    const user = await requireApiUser();
    requireOwner(workspaceFor(user).role);
    const [suggestions, providers] = await Promise.all([
      Promise.resolve(tagUnificationService.list()),
      tagUnificationService.configuredProviders()
    ]);
    return Response.json({ suggestions, providers }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    requireOwner(workspaceFor(user).role);
    const input = await readJsonBody(request, 16 * 1024);
    try {
      const result = await tagUnificationService.analyze(input);
      return Response.json(result, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    } catch (error) {
      // The AI SDK's wording for "the model answered, but not in the requested shape".
      if (error instanceof Error && /no object generated/i.test(error.message)) {
        throw new ApiError(502, 'The model did not return usable tag suggestions. Choose another model and try again.');
      }
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
