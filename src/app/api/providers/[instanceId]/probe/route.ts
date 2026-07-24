import { assertSameOrigin, apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import providerDiscoveryService from '@root/services/providerDiscoveryService';
import providerRegistry from '@root/services/providerRegistry';
import { getEffectiveProviderEnvironment } from '@root/services/settingsV3Service';

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
    return Response.json(
      await providerDiscoveryService.probeProvider(instanceId, await getEffectiveProviderEnvironment()),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
