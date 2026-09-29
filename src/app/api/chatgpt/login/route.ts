import { assertSameOrigin, apiError, requireApiUser } from '@/lib/server/auth';
import { backendBearerHeaders } from '../../../../../services/backendProxyAuth';

const backendUrl = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    await requireApiUser();
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
