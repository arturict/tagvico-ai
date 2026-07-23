import crypto from 'node:crypto';
import type {
  CompanionModelCatalog,
  CompanionModelProvider,
  CompanionModelSelection
} from '../contracts/companion';
import type { ModelDescriptor } from '../contracts/provider';
import providerDiscoveryService from './providerDiscoveryService';
import providerRegistry from './providerRegistry';
import { applyPersistedAiSelection } from './managedAiSelection';
import setupService from './setupService';

type Environment = Record<string, string | undefined>;
type ProviderDefinition = ReturnType<typeof providerRegistry.getProviderDefinitions>[number];

const SUPPORTED_ADAPTERS = new Set([
  'ai-sdk-openai',
  'ai-sdk-compatible',
  'codex-runtime',
  'copilot-sdk',
  'native-anthropic',
  'native-ollama'
]);
const CACHE_TTL_MS = 60_000;

let cachedCatalog: {
  expiresAt: number;
  fingerprint: string;
  value: CompanionModelCatalog;
} | null = null;
let inFlight: { fingerprint: string; promise: Promise<CompanionModelCatalog> } | null = null;

export function supportsCompanionRuntime(definition: Pick<ProviderDefinition, 'runtimeAdapter' | 'discovery'>) {
  return definition.discovery !== 'manual' && SUPPORTED_ADAPTERS.has(definition.runtimeAdapter);
}

export function hasCompanionConfiguration(definition: ProviderDefinition, env: Environment) {
  if (definition.id === 'codex' || definition.id === 'copilot' || definition.id === 'ollama') {
    return true;
  }
  if (definition.id === 'compatible') {
    return Boolean(providerRegistry.environmentValue(
      env,
      'COMPATIBLE_BASE_URL',
      ['CUSTOM_BASE_URL']
    ));
  }
  const requiredFields = definition.fields.filter((field) => field.required);
  return requiredFields.every((field) => Boolean(providerRegistry.environmentValue(
    env,
    field.environmentKey,
    field.legacyEnvironmentKeys
  )));
}

export function pickCompanionDefault(
  providers: CompanionModelProvider[],
  configured: CompanionModelSelection | null
): CompanionModelSelection | null {
  if (configured) {
    const provider = providers.find((candidate) => candidate.instanceId === configured.providerInstanceId);
    if (provider?.models.some((model) => model.id === configured.modelId)) return configured;
  }
  for (const provider of providers) {
    const model = provider.models.find((candidate) => candidate.isDefault) || provider.models[0];
    if (model) return { providerInstanceId: provider.instanceId, modelId: model.id };
  }
  return null;
}

export function selectionIsAvailable(
  catalog: CompanionModelCatalog,
  selection: CompanionModelSelection | null
): selection is CompanionModelSelection {
  if (!selection) return false;
  return Boolean(catalog.providers
    .find((provider) => provider.instanceId === selection.providerInstanceId)
    ?.models.some((model) => model.id === selection.modelId));
}

async function effectiveEnvironment(): Promise<Environment> {
  const persisted = (await setupService.loadConfig()) || {};
  return applyPersistedAiSelection({ ...persisted, ...process.env }, persisted);
}

function configurationFingerprint(env: Environment) {
  const keys = new Set(['AI_PROVIDER', 'COMPANION_PROVIDER', 'AI_MODEL']);
  for (const definition of providerRegistry.getProviderDefinitions()) {
    keys.add(definition.modelEnvironmentKey);
    for (const key of definition.legacyModelEnvironmentKeys || []) keys.add(key);
    for (const field of definition.fields) {
      keys.add(field.environmentKey);
      for (const key of field.legacyEnvironmentKeys || []) keys.add(key);
    }
  }
  const payload = [...keys].sort().map((key) => [key, env[key] || '']);
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function discoverVerifiedProvider(
  definition: ProviderDefinition,
  env: Environment
): Promise<CompanionModelProvider | null> {
  if (!supportsCompanionRuntime(definition) || !hasCompanionConfiguration(definition, env)) return null;
  try {
    const models = await providerDiscoveryService.discoverProviderModels(definition.id, env) as ModelDescriptor[];
    if (!models.length) return null;
    return {
      instanceId: definition.id,
      name: definition.name,
      models
    };
  } catch {
    // Authentication and endpoint errors are intentionally not exposed here.
    // A provider becomes selectable only after its live catalog succeeds.
    return null;
  }
}

async function loadCatalog(env: Environment): Promise<CompanionModelCatalog> {
  const definitions = providerRegistry.getProviderDefinitions()
    .filter(supportsCompanionRuntime);
  const results = await Promise.all(definitions.map((definition) => discoverVerifiedProvider(definition, env)));
  const providers = results.filter((result): result is CompanionModelProvider => Boolean(result));
  const activeProviderId = String(env.AI_PROVIDER || env.COMPANION_PROVIDER || '').trim();
  const activeDefinition = providerRegistry.getProviderDefinition(activeProviderId);
  const activeModelId = activeDefinition
    ? providerRegistry.getConfiguredModel(activeDefinition, env)
    : String(env.AI_MODEL || '').trim();
  const configured = activeProviderId && activeModelId
    ? { providerInstanceId: activeProviderId, modelId: activeModelId }
    : null;
  return {
    providers,
    defaultSelection: pickCompanionDefault(providers, configured)
  };
}

export async function getCompanionModelCatalog(force = false): Promise<CompanionModelCatalog> {
  const env = await effectiveEnvironment();
  const fingerprint = configurationFingerprint(env);
  if (!force
    && cachedCatalog
    && cachedCatalog.fingerprint === fingerprint
    && cachedCatalog.expiresAt > Date.now()) {
    return cachedCatalog.value;
  }
  if (!force && inFlight?.fingerprint === fingerprint) return inFlight.promise;
  const promise = loadCatalog(env);
  inFlight = { fingerprint, promise };
  try {
    const value = await promise;
    cachedCatalog = { value, fingerprint, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

export function clearCompanionModelCatalogCache() {
  cachedCatalog = null;
  inFlight = null;
}

const companionModelService = {
  clearCompanionModelCatalogCache,
  getCompanionModelCatalog,
  hasCompanionConfiguration,
  pickCompanionDefault,
  selectionIsAvailable,
  supportsCompanionRuntime
};

export default companionModelService;
module.exports = companionModelService;
