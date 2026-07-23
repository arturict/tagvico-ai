import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '@root/services/backendProxyAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') {
      throw new ApiError(403, 'Only the Tagvico owner can scan for Paperless instances.');
    }
    const { hint } = await readJsonBody<{ hint?: unknown }>(request, 8 * 1024);
    const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
    const response = await fetch(`${backend}/api/paperless/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...backendBearerHeaders(request)
      },
      body: JSON.stringify({ hint: String(hint || '').slice(0, 2048) }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000)
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
