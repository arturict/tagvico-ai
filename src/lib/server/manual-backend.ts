import 'server-only';

import { ApiError } from './auth';
import { backendBearerHeaders } from '@root/services/backendProxyAuth';

const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

export async function manualBackendRequest(
  request: Request,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000
) {
  let response: Response;
  try {
    response = await fetch(`${backend}${path}`, {
      ...init,
      headers: {
        ...backendBearerHeaders(request),
        ...init.headers
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(504, 'The Paperless operation timed out.');
    }
    throw new ApiError(502, 'The Tagvico backend is unavailable.');
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(502, 'The Tagvico backend rejected the authenticated request.');
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
