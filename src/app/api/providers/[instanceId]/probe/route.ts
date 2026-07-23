import { assertSameOrigin, apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import providerDiscoveryService from '@root/services/providerDiscoveryService';
import providerRegistry from '@root/services/providerRegistry';
import setupService from '@root/services/setupService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') {
      throw new ApiError(403, 'Only the Tagvico owner can probe providers.');
    }
    const { instanceId } = await params;
    if (!providerRegistry.getProviderDefinition(instanceId)) {
      throw new ApiError(404, `Provider instance "${instanceId}" is unavailable.`);
    }
    const persisted = (await setupService.loadConfig()) || {};
    return Response.json(
      await providerDiscoveryService.probeProvider(instanceId, { ...process.env, ...persisted }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
