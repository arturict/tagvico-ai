import { z } from 'zod';
import { assertSameOrigin, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { backendBearerHeaders } from '@root/services/backendProxyAuth';
import paperlessIdentityService from '@root/services/paperlessIdentityService';
import { getEffectiveProviderEnvironment } from '@root/services/settingsV3Service';
import { settingsErrorResponse } from '../../settings/error-response';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  baseUrl: z.string().trim().max(2048).optional(),
  token: z.string().max(4096).optional()
}).strict();

interface ProbeResult {
  success?: boolean;
  instance?: {
    ok?: boolean;
    version?: string | null;
    authenticated?: boolean;
    requiresAuth?: boolean;
    error?: string | null;
  };
}

/**
 * Tests a Paperless address and token without saving them. A missing address
 * falls back to the saved one. The saved token is used only when the tested
 * address is the saved address, so it is checked without ever being sent to
 * the browser or to a host the owner typed.
 */
export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') {
      throw new ApiError(403, 'Only the Tagvico owner can test the Paperless connection.');
    }
    const body = requestSchema.parse(await readJsonBody(request, 16 * 1024));
    const saved = await getEffectiveProviderEnvironment();
    const baseUrl = (body.baseUrl || String(saved.PAPERLESS_API_URL || '')).replace(/\/+$/, '').replace(/\/api$/i, '');
    const token = paperlessIdentityService.tokenForProbe(body.token, baseUrl, {
      url: String(saved.PAPERLESS_API_URL || ''),
      token: String(saved.PAPERLESS_API_TOKEN || '')
    });
    if (!baseUrl) return Response.json({ ok: false, message: 'Enter the Paperless address first.', field: 'paperless.baseUrl' });
    try {
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('unsupported');
    } catch {
      return Response.json({ ok: false, message: 'Enter a full http:// or https:// address without embedded credentials.', field: 'paperless.baseUrl' });
    }
    if (!token) return Response.json({ ok: false, message: 'Enter an API token to test this address.', field: 'paperless.token' });

    const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
    const response = await fetch(`${backend}/api/paperless/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...backendBearerHeaders(request) },
      body: JSON.stringify({ url: baseUrl, token }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000)
    });
    const result = await response.json().catch(() => ({})) as ProbeResult;
    const instance = result.instance;
    if (response.ok && instance?.ok && instance.authenticated) {
      return Response.json({
        ok: true,
        version: instance.version || null,
        message: instance.version ? `Connected to Paperless-ngx ${instance.version}.` : 'Connected to Paperless-ngx.'
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const detail = instance?.error ? String(instance.error) : '';
    const unreachable = !instance?.version && !instance?.requiresAuth && !instance?.authenticated;
    return Response.json({
      ok: false,
      field: instance?.requiresAuth ? 'paperless.token' : 'paperless.baseUrl',
      message: unreachable
        ? `Could not reach Paperless at ${baseUrl}${detail ? ` (${detail})` : ''}. Check the address from the Tagvico server.`
        : detail || 'Paperless did not accept this token.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
