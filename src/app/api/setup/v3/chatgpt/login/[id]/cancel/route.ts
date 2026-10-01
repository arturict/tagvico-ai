import { apiError } from '@/lib/server/auth';
import { assertInitialSetupOpen } from '@/lib/server/initial-setup';

const backendUrl = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertInitialSetupOpen(request);
    const { id } = await params;
    const response = await fetch(`${backendUrl}/api/chatgpt/login/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
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
