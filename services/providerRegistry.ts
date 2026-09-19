import { z } from 'zod';
import type {
  ModelDescriptor,
  ProviderFieldDescriptor,
  ProviderIconDescriptor,
  ProviderInstanceId,
  ProviderOptionDescriptor
} from '../contracts/provider';

type Environment = Record<string, string | undefined>;
type RuntimeAdapter =
  | 'ai-sdk-openai'
  | 'ai-sdk-compatible'
  | 'codex-runtime'
  | 'copilot-sdk'
  | 'native-ollama'
  | 'typesafe-systemone';
type DiscoveryKind = 'openai' | 'ollama' | 'codex' | 'copilot' | 'static';
const MAX_DISCOVERY_RESPONSE_BYTES = 1024 * 1024;
const MAX_DISCOVERY_MODELS = 500;

interface ProviderDefinition {
  id: ProviderInstanceId;
  name: string;
  description: string;
  icon: ProviderIconDescriptor | null;
  runtimeAdapter: RuntimeAdapter;
  serviceModule: string;
  recommended?: boolean;
  discovery: DiscoveryKind;
  modelEnvironmentKey: string;
  legacyModelEnvironmentKeys?: string[];
  configurationSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  fields: Array<ProviderFieldDescriptor & { environmentKey: string; legacyEnvironmentKeys?: string[] }>;
  suggestedModels: Array<{ id: string; name: string; description?: string }>;
  manualModelInput: boolean;
}

const optionalString = z.string().trim().max(4096).optional();
const optionalUrl = z.string().trim().url().max(2048).optional();
const requiredUrl = z.string().trim().url().max(2048);

function secret(key: string, label: string, environmentKey: string, required = false): ProviderDefinition['fields'][number] {
  return {
    key,
    label,
    environmentKey,
    type: 'password',
    required,
    secret: true,
    description: 'Stored only in Tagvico data. Existing values are never returned to the browser.'
  };
}

function url(
  key: string,
  label: string,
  environmentKey: string,
  required = true,
  defaultValue?: string
): ProviderDefinition['fields'][number] {
  return {
    key,
    label,
    environmentKey,
    type: 'url',
    required,
    ...(defaultValue ? { defaultValue } : {}),
    secret: false
  };
}

const definitions = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Cloud model routing with a live account catalog and optional curated suggestions.',
    icon: {
      path: '/provider-icons/openrouter.svg',
      source: 'https://svgl.app/library/openrouter_dark.svg'
    },
    runtimeAdapter: 'ai-sdk-openai',
    serviceModule: './openaiService',
    recommended: true,
    discovery: 'openai',
    modelEnvironmentKey: 'OPENROUTER_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({
      apiKey: optionalString,
      baseUrl: optionalUrl
    }).strict(),
    fields: [
      secret('apiKey', 'API key', 'OPENROUTER_API_KEY', true),
      {
        ...url('baseUrl', 'Base URL', 'OPENROUTER_BASE_URL', true, 'https://openrouter.ai/api/v1'),
        placeholder: 'https://openrouter.ai/api/v1'
      }
    ],
    suggestedModels: [
      { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', description: 'Curated balanced suggestion; availability is verified against your live catalog.' },
      { id: 'openrouter/free', name: 'OpenRouter Free router', description: 'Curated trial suggestion with variable availability.' }
    ],
    manualModelInput: true
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local or remote Ollama inference with model discovery from the configured instance.',
    icon: {
      path: '/provider-icons/ollama.svg',
      source: 'https://svgl.app/library/ollama_dark.svg'
    },
    runtimeAdapter: 'native-ollama',
    serviceModule: './ollamaService',
    discovery: 'ollama',
    modelEnvironmentKey: 'OLLAMA_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({
      baseUrl: requiredUrl.optional(),
      apiKey: optionalString
    }).strict(),
    fields: [
      {
        ...url('baseUrl', 'Ollama URL', 'OLLAMA_API_URL', true, 'http://localhost:11434'),
        placeholder: 'http://localhost:11434'
      },
      secret('apiKey', 'API key (optional)', 'OLLAMA_API_KEY')
    ],
    suggestedModels: [],
    manualModelInput: true
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    description: 'Ollama-hosted inference with the models exposed by the configured cloud account.',
    icon: {
      path: '/provider-icons/ollama.svg',
      source: 'https://svgl.app/library/ollama_dark.svg'
    },
    runtimeAdapter: 'native-ollama',
    serviceModule: './ollamaService',
    discovery: 'ollama',
    modelEnvironmentKey: 'OLLAMA_CLOUD_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({
      baseUrl: requiredUrl.optional(),
      apiKey: optionalString
    }).strict(),
    fields: [
      {
        ...url('baseUrl', 'Cloud URL', 'OLLAMA_CLOUD_API_URL', true, 'https://ollama.com'),
        placeholder: 'https://ollama.com'
      },
      secret('apiKey', 'API key', 'OLLAMA_CLOUD_API_KEY', true)
    ],
    suggestedModels: [],
    manualModelInput: true
  },
  {
    id: 'opencode',
    name: 'OpenCode Go',
    description: 'OpenAI-compatible inference through Vercel AI SDK.',
    icon: {
      path: '/provider-icons/opencode.svg',
      source: 'https://svgl.app/library/opencode-dark.svg'
    },
    runtimeAdapter: 'ai-sdk-compatible',
    serviceModule: './customService',
    discovery: 'openai',
    modelEnvironmentKey: 'OPENCODE_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({
      baseUrl: requiredUrl.optional(),
      apiKey: optionalString
    }).strict(),
    fields: [
      {
        ...url('baseUrl', 'Base URL', 'OPENCODE_BASE_URL', true, 'https://opencode.ai/zen/go/v1'),
        placeholder: 'https://opencode.ai/zen/go/v1'
      },
      secret('apiKey', 'API key', 'OPENCODE_API_KEY', true)
    ],
    suggestedModels: [],
    manualModelInput: true
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Official Copilot SDK, account authentication and live plan model discovery.',
    icon: {
      path: '/provider-icons/github-copilot.svg',
      source: 'https://svgl.app/library/copilot_dark.svg'
    },
    runtimeAdapter: 'copilot-sdk',
    serviceModule: './copilotService',
    discovery: 'copilot',
    modelEnvironmentKey: 'COPILOT_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({ githubToken: optionalString }).strict(),
    fields: [secret('githubToken', 'GitHub token (optional)', 'COPILOT_GITHUB_TOKEN')],
    suggestedModels: [],
    manualModelInput: false
  },
  {
    id: 'compatible',
    name: 'CLI Proxy / Compatible',
    description: 'CLIProxyAPI, LiteLLM, vLLM and other OpenAI-compatible endpoints through Vercel AI SDK.',
    icon: null,
    runtimeAdapter: 'ai-sdk-compatible',
    serviceModule: './customService',
    discovery: 'openai',
    modelEnvironmentKey: 'COMPATIBLE_MODEL',
    legacyModelEnvironmentKeys: ['CUSTOM_MODEL', 'AI_MODEL'],
    configurationSchema: z.object({
      baseUrl: requiredUrl.optional(),
      apiKey: optionalString
    }).strict(),
    fields: [
      {
        ...url('baseUrl', 'Base URL', 'COMPATIBLE_BASE_URL'),
        legacyEnvironmentKeys: ['CUSTOM_BASE_URL'],
        placeholder: 'http://localhost:8317/v1'
      },
      {
        ...secret('apiKey', 'API key (optional)', 'COMPATIBLE_API_KEY'),
        legacyEnvironmentKeys: ['CUSTOM_API_KEY']
      }
    ],
    suggestedModels: [],
    manualModelInput: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Native OpenAI inference through Vercel AI SDK with a live account model catalog.',
    icon: {
      path: '/provider-icons/openai.svg',
      source: 'https://svgl.app/library/openai_dark.svg'
    },
    runtimeAdapter: 'ai-sdk-openai',
    serviceModule: './openaiService',
    discovery: 'openai',
    modelEnvironmentKey: 'OPENAI_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({ apiKey: optionalString }).strict(),
    fields: [secret('apiKey', 'API key', 'OPENAI_API_KEY', true)],
    suggestedModels: [
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: 'Curated fallback preference, not proof of account availability.' }
    ],
    manualModelInput: true
  },
  {
    id: 'codex',
    name: 'ChatGPT subscription',
    description: 'Official Codex runtime with models and reasoning efforts returned by the signed-in ChatGPT account.',
    icon: {
      path: '/provider-icons/openai.svg',
      source: 'https://svgl.app/library/openai_dark.svg'
    },
    runtimeAdapter: 'codex-runtime',
    serviceModule: './codexService',
    discovery: 'codex',
    modelEnvironmentKey: 'CODEX_MODEL',
    legacyModelEnvironmentKeys: ['AI_MODEL'],
    configurationSchema: z.object({}).strict(),
    fields: [],
    suggestedModels: [],
    manualModelInput: false
  },
  {
    id: 'typesafe',
    name: 'TypeSafe Jev',
    description: 'Decision model for closed-list filing: picks from your existing tags, correspondents and document types with calibrated probabilities. No text generation, no Companion.',
    icon: null,
    runtimeAdapter: 'typesafe-systemone',
    serviceModule: './typesafeService',
    discovery: 'static',
    modelEnvironmentKey: 'TYPESAFE_MODEL',
    configurationSchema: z.object({
      apiKey: optionalString,
      baseUrl: optionalUrl
    }).strict(),
    fields: [
      secret('apiKey', 'API key', 'TYPESAFE_API_KEY', true),
      {
        ...url('baseUrl', 'Base URL', 'TYPESAFE_BASE_URL', false, 'https://api.typesafe.ai/v1'),
        placeholder: 'https://api.typesafe.ai/v1'
      }
    ],
    suggestedModels: [
      { id: 'jev-latest', name: 'Jev (latest)', description: 'Stable alias published by TypeSafe.' },
      { id: 'jev-preview', name: 'Jev (preview)', description: 'Preview alias; may equal the stable release.' }
    ],
    manualModelInput: true
  }
] as const satisfies readonly ProviderDefinition[];

const definitionMap = new Map<string, ProviderDefinition>(
  definitions.map((definition) => [definition.id, definition])
);

function environmentValue(env: Environment, key: string, legacyKeys: string[] = []): string {
  if (env[key] !== undefined) return String(env[key] || '');
  for (const legacyKey of legacyKeys) {
    if (env[legacyKey] !== undefined) return String(env[legacyKey] || '');
  }
  return '';
}

function getProviderDefinition(instanceId: string): ProviderDefinition | null {
  return definitionMap.get(instanceId) || null;
}

function getProviderDefinitions(): ProviderDefinition[] {
  return [...definitions];
}

function getConfiguredModel(definition: ProviderDefinition, env: Environment): string {
  return environmentValue(env, definition.modelEnvironmentKey, definition.legacyModelEnvironmentKeys);
}

function normalizeReasoningOptions(
  efforts: Array<{ id?: unknown; name?: unknown; description?: unknown }> | string[],
  defaultValue?: string | null
): ProviderOptionDescriptor[] {
  const values = efforts.map((effort) => typeof effort === 'string'
    ? { id: effort, label: effort }
    : {
        id: String(effort.id || effort.name || ''),
        label: String(effort.name || effort.id || ''),
        description: effort.description ? String(effort.description) : undefined
      })
    .filter((effort) => effort.id && effort.label);
  if (!values.length) return [];
  return [{
    id: 'reasoningEffort',
    label: 'Thinking effort',
    description: 'Options reported by this model at runtime.',
    type: 'select',
    defaultValue: defaultValue || null,
    values
  }];
}

function normalizeModels(
  models: Array<Omit<ModelDescriptor, 'capabilities'> & { capabilities?: string[] }>
): ModelDescriptor[] {
  const unique = new Map<string, ModelDescriptor>();
  for (const model of models) {
    if (unique.size >= MAX_DISCOVERY_MODELS) break;
    const id = String(model.id || '').trim();
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: String(model.name || id).trim() || id,
      isDefault: Boolean(model.isDefault),
      options: Array.isArray(model.options) ? model.options : [],
      capabilities: Array.isArray(model.capabilities)
        ? [...new Set(model.capabilities.map((capability) => String(capability).trim().toLowerCase()).filter(Boolean))]
        : [],
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {})
    });
  }
  return [...unique.values()];
}

function baseUrlFor(definition: ProviderDefinition, env: Environment): string {
  const field = definition.fields.find((candidate) => candidate.key === 'baseUrl');
  const configured = field
    ? environmentValue(env, field.environmentKey, field.legacyEnvironmentKeys)
    : '';
  if (configured) return configured.replace(/\/+$/, '');
  if (definition.id === 'openrouter') return 'https://openrouter.ai/api/v1';
  if (definition.id === 'ollama') return 'http://localhost:11434';
  if (definition.id === 'ollama-cloud') return 'https://ollama.com';
  if (definition.id === 'opencode') return 'https://opencode.ai/zen/go/v1';
  if (definition.id === 'openai') return 'https://api.openai.com/v1';
  if (definition.id === 'typesafe') return 'https://api.typesafe.ai/v1';
  return '';
}

function secretFor(definition: ProviderDefinition, env: Environment): string {
  const field = definition.fields.find((candidate) => candidate.secret);
  return field ? environmentValue(env, field.environmentKey, field.legacyEnvironmentKeys) : '';
}

async function readBoundedResponse(
  response: Response,
  maximumBytes = MAX_DISCOVERY_RESPONSE_BYTES
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`Model discovery response exceeds the ${maximumBytes}-byte limit.`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error(`Model discovery response exceeds the ${maximumBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  init: { method?: string; body?: string; signal?: AbortSignal } = {}
): Promise<unknown> {
  const { signal, ...requestInit } = init;
  const response = await fetch(url, {
    ...requestInit,
    headers,
    signal: signal || AbortSignal.timeout(10_000),
    cache: 'no-store'
  });
  if (!response.ok) {
    const hint = await readBoundedResponse(response, 4096).catch(() => '');
    throw new Error(`Model discovery returned HTTP ${response.status}${hint ? `: ${hint.slice(0, 180)}` : ''}`);
  }
  const body = await readBoundedResponse(response);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Model discovery returned invalid JSON.');
  }
}

async function discoverOpenAIModels(definition: ProviderDefinition, env: Environment): Promise<ModelDescriptor[]> {
  const baseUrl = baseUrlFor(definition, env);
  if (!baseUrl) throw new Error('Configure a base URL before loading models.');
  const apiKey = secretFor(definition, env);
  const payload = await fetchJson(`${baseUrl}/models`, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
  const source = payload && typeof payload === 'object'
    ? (payload as { data?: unknown[]; models?: unknown[] })
    : {};
  const entries = Array.isArray(source.data) ? source.data : Array.isArray(source.models) ? source.models : [];
  return normalizeModels(entries.map((entry) => {
    const candidate = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const id = String(candidate.id || candidate.model || '');
    return {
      id,
      name: String(candidate.name || candidate.display_name || id),
      isDefault: Boolean(candidate.is_default),
      options: [],
      ...(Number(candidate.context_length) > 0 ? { contextWindow: Number(candidate.context_length) } : {})
    };
  }));
}

async function discoverOllamaModels(definition: ProviderDefinition, env: Environment): Promise<ModelDescriptor[]> {
  const baseUrl = baseUrlFor(definition, env);
  const apiKey = secretFor(definition, env);
  const discoverySignal = AbortSignal.timeout(10_000);
  const authHeaders: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
  const payload = await fetchJson(`${baseUrl}/api/tags`, authHeaders, { signal: discoverySignal });
  const entries = payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown[] }).models)
    ? (payload as { models: unknown[] }).models
    : [];
  const candidates = entries.slice(0, MAX_DISCOVERY_MODELS).map((entry) => {
    const candidate = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const id = String(candidate.name || candidate.model || '');
    return { id, name: id, isDefault: false, options: [], capabilities: [] };
  }).filter((model) => model.id);

  const detailed: ModelDescriptor[] = [];
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    detailed.push(...await Promise.all(batch.map(async (model) => {
      try {
        const details = await fetchJson(`${baseUrl}/api/show`, {
          ...authHeaders,
          'Content-Type': 'application/json'
        }, {
          method: 'POST',
          body: JSON.stringify({ model: model.id, verbose: false }),
          signal: discoverySignal
        });
        const source = details && typeof details === 'object'
          ? details as { capabilities?: unknown[]; model_info?: Record<string, unknown> }
          : {};
        const capabilities = Array.isArray(source.capabilities)
          ? source.capabilities.map((capability) => String(capability))
          : [];
        const contextWindow = Object.entries(source.model_info || {})
          .find(([key, value]) => key.endsWith('.context_length') && Number(value) > 0)?.[1];
        return {
          ...model,
          capabilities,
          ...(Number(contextWindow) > 0 ? { contextWindow: Number(contextWindow) } : {})
        };
      } catch {
        // Keep the model available for structured-output filing without
        // claiming capabilities that the runtime did not verify.
        return model;
      }
    })));
  }
  return normalizeModels(detailed);
}

function readProviderConfiguration(definition: ProviderDefinition, env: Environment) {
  return Object.fromEntries(definition.fields.map((field) => {
    const value = environmentValue(env, field.environmentKey, field.legacyEnvironmentKeys);
    return [field.key, field.secret ? { configured: Boolean(value) } : value];
  }));
}

function providerValuesToEnvironment(instanceId: string, values: Record<string, string | boolean>) {
  const definition = getProviderDefinition(instanceId);
  if (!definition) throw new Error(`Provider instance "${instanceId}" is not available in this Tagvico build.`);
  const parsed = definition.configurationSchema.partial().parse(values);
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const field = definition.fields.find((candidate) => candidate.key === key);
    if (!field || value === undefined) continue;
    if (field.secret && String(value).trim() === '') continue;
    environment[field.environmentKey] = String(value);
  }
  return environment;
}

const providerRegistry = {
  baseUrlFor,
  discoverOllamaModels,
  discoverOpenAIModels,
  environmentValue,
  getConfiguredModel,
  getProviderDefinition,
  getProviderDefinitions,
  providerValuesToEnvironment,
  readProviderConfiguration,
  secretFor,
  normalizeModels,
  normalizeReasoningOptions
};

export default providerRegistry;
module.exports = providerRegistry;
