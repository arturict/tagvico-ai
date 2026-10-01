import { assertSameOrigin, apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '../../../../../services/backendProxyAuth';

const backendUrl = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can connect a ChatGPT plan.');
    const response = await fetch(`${backendUrl}/api/chatgpt/login`, {
      method: 'POST',
      headers: backendBearerHeaders(request),
      cache: 'no-store',
      redirect: 'manual'
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}
