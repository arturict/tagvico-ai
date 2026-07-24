import type { ModelDescriptor } from '../contracts/provider';
import codexAuthService from './codexAuthService';
import copilotService from './copilotService';
import providerRegistry from './providerRegistry';

type Environment = Record<string, string | undefined>;

async function discoverCodexModels(): Promise<ModelDescriptor[]> {
  const models = await codexAuthService.models() as Array<{
    id: string;
    name: string;
    isDefault?: boolean;
    reasoningEfforts?: Array<{ id?: unknown; description?: unknown }>;
  }>;
  return providerRegistry.normalizeModels(models.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    isDefault: Boolean(model.isDefault),
    options: providerRegistry.normalizeReasoningOptions(model.reasoningEfforts || [])
  })));
}

async function discoverCopilotModels(env: Environment): Promise<ModelDescriptor[]> {
  const status = await copilotService.status({
    gitHubToken: env.COPILOT_GITHUB_TOKEN || undefined
  });
  if (!status.ok) throw new Error(status.error || 'GitHub Copilot is not authenticated.');
  return providerRegistry.normalizeModels(status.models.map((model: {
    id: string;
    name?: string;
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string | null;
  }) => ({
    id: model.id,
    name: model.name || model.id,
    isDefault: false,
    options: providerRegistry.normalizeReasoningOptions(
      model.reasoningEfforts || [],
      model.defaultReasoningEffort
    )
  })));
}

async function discoverProviderModels(instanceId: string, env: Environment): Promise<ModelDescriptor[]> {
  const definition = providerRegistry.getProviderDefinition(instanceId);
  if (!definition) throw new Error(`Provider instance "${instanceId}" is not available in this Tagvico build.`);
  switch (definition.discovery) {
    case 'openai': return providerRegistry.discoverOpenAIModels(definition, env);
    case 'ollama': return providerRegistry.discoverOllamaModels(definition, env);
    case 'codex': return discoverCodexModels();
    case 'copilot': return discoverCopilotModels(env);
    default: return [];
  }
}

async function probeProvider(instanceId: string, env: Environment) {
  const definition = providerRegistry.getProviderDefinition(instanceId);
  if (!definition) throw new Error(`Provider instance "${instanceId}" is not available in this Tagvico build.`);
  const startedAt = Date.now();
  const models = await discoverProviderModels(instanceId, env);
  return { ok: true, latencyMs: Date.now() - startedAt, models: models.length, mode: 'catalog' as const };
}

const providerDiscoveryService = { discoverProviderModels, probeProvider };

export default providerDiscoveryService;
module.exports = providerDiscoveryService;
