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
  | 'native-ollama';
type DiscoveryKind = 'openai' | 'ollama' | 'codex' | 'copilot';

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

function url(key: string, label: string, environmentKey: string, required = true): ProviderDefinition['fields'][number] {
  return {
    key,
    label,
    environmentKey,
    type: 'url',
    required,
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
      { ...url('baseUrl', 'Base URL', 'OPENROUTER_BASE_URL'), placeholder: 'https://openrouter.ai/api/v1' }
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
      { ...url('baseUrl', 'Ollama URL', 'OLLAMA_API_URL'), placeholder: 'http://localhost:11434' },
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
      { ...url('baseUrl', 'Cloud URL', 'OLLAMA_CLOUD_API_URL'), placeholder: 'https://ollama.com' },
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
      { ...url('baseUrl', 'Base URL', 'OPENCODE_BASE_URL'), placeholder: 'https://opencode.ai/zen/go/v1' },
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

function normalizeModels(models: ModelDescriptor[]): ModelDescriptor[] {
  const unique = new Map<string, ModelDescriptor>();
  for (const model of models) {
    const id = String(model.id || '').trim();
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: String(model.name || id).trim() || id,
      isDefault: Boolean(model.isDefault),
      options: Array.isArray(model.options) ? model.options : [],
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
  return '';
}

function secretFor(definition: ProviderDefinition, env: Environment): string {
  const field = definition.fields.find((candidate) => candidate.secret);
  return field ? environmentValue(env, field.environmentKey, field.legacyEnvironmentKeys) : '';
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store'
  });
  if (!response.ok) {
    const hint = await response.text().catch(() => '');
    throw new Error(`Model discovery returned HTTP ${response.status}${hint ? `: ${hint.slice(0, 180)}` : ''}`);
  }
  return response.json();
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
  const payload = await fetchJson(`${baseUrl}/api/tags`, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
  const entries = payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown[] }).models)
    ? (payload as { models: unknown[] }).models
    : [];
  return normalizeModels(entries.map((entry) => {
    const candidate = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const id = String(candidate.name || candidate.model || '');
    return { id, name: id, isDefault: false, options: [] };
  }));
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
