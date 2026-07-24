import { apiError, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import providerDiscoveryService from '@root/services/providerDiscoveryService';
import providerRegistry from '@root/services/providerRegistry';
import { getEffectiveProviderEnvironment } from '@root/services/settingsV3Service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  try {
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') {
      throw new ApiError(403, 'Only the Tagvico owner can load provider models.');
    }
    const { instanceId } = await params;
    const definition = providerRegistry.getProviderDefinition(instanceId);
    if (!definition) throw new ApiError(404, `Provider instance "${instanceId}" is unavailable.`);
    const models = await providerDiscoveryService.discoverProviderModels(
      instanceId,
      await getEffectiveProviderEnvironment()
    );
    return Response.json({
      instanceId,
      source: 'runtime',
      manualModelInput: definition.manualModelInput,
      models
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
