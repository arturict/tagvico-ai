import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '../../../../../../../services/backendProxyAuth';

const backendUrl = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can connect a ChatGPT plan.');
    const { id } = await params;
    const body = await readJsonBody(request, 16 * 1024) as { callbackUrl?: unknown };
    const response = await fetch(`${backendUrl}/api/chatgpt/login/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...backendBearerHeaders(request) },
      body: JSON.stringify({ callbackUrl: String(body?.callbackUrl || '') }),
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
