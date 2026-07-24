import { setupV3Schema } from '@root/contracts/provider';
import { assertSameOrigin, apiError, readJsonBody } from '@/lib/server/auth';

const providerRegistryModule = require('@root/services/providerRegistry');
const providerRegistry = providerRegistryModule.default || providerRegistryModule;

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    if (process.env.ALLOW_REMOTE_SETUP !== 'yes') {
      return Response.json({
        error: 'Setup through the web application is disabled. Set ALLOW_REMOTE_SETUP=yes temporarily to opt in.'
      }, { status: 403 });
    }
    const input = setupV3Schema.parse(await readJsonBody(request));
    const definition = providerRegistry.getProviderDefinition(input.provider.instanceId);
    if (!definition) {
      return Response.json({ error: `Provider "${input.provider.instanceId}" is unavailable.` }, { status: 400 });
    }
    const providerEnvironment = providerRegistry.providerValuesToEnvironment(
      input.provider.instanceId,
      input.provider.values
    );
    const payload: Record<string, unknown> = {
      paperlessUrl: input.paperless.baseUrl.replace(/\/+$/, ''),
      paperlessToken: input.paperless.token,
      paperlessUsername: input.paperless.username,
      username: input.account.username,
      password: input.account.password,
      confirmPassword: input.account.confirmPassword,
      aiProvider: input.provider.instanceId,
      AI_PROVIDER: input.provider.instanceId,
      AI_MODEL: input.provider.modelId,
      [definition.modelEnvironmentKey]: input.provider.modelId,
      ...providerEnvironment,
      scanInterval: '*/30 * * * *',
      showTags: false,
      tags: '',
      tagGroupsJson: '[]',
      controlledTaggingEnabled: false,
      activateTagging: true,
      activateCorrespondents: true,
      activateDocumentType: true,
      activateTitle: true,
      activateCustomFields: false,
      activateOwnerAssignment: true,
      disableAutomaticProcessing: false,
      aiReasoningEffort: 'auto'
    };
    const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
    const response = await fetch(`${backend}/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(120_000)
    });
    return new Response(await response.text(), {
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
