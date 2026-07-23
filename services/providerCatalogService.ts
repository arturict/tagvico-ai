type ProviderId =
  | 'openrouter'
  | 'ollama'
  | 'ollama-cloud'
  | 'opencode'
  | 'copilot'
  | 'compatible'
  | 'openai'
  | 'anthropic'
  | 'codex'
  | 'azure';
type EnvLike = Record<string, string | undefined>;
const providerRegistryModule = require('./providerRegistry');
const providerRegistry = providerRegistryModule.default || providerRegistryModule;
const PROVIDER_IDS = [
  'openrouter', 'ollama', 'ollama-cloud', 'opencode', 'copilot', 'compatible', 'openai', 'anthropic', 'codex', 'azure'
] as const;

const OPENROUTER_PRESETS = [
  {
    slug: 'openai/gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'OpenAI via OpenRouter',
    summary: 'Recommended balance for accurate, low-touch document filing.',
    badges: ['Recommended', 'Balanced'],
    recommended: true,
    reasoning: 'low'
  },
  {
    slug: 'openai/gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'OpenAI via OpenRouter',
    summary: 'Fastest paid choice for clean, repetitive document batches.',
    badges: ['Fast', 'Budget'],
    reasoning: 'low'
  },
  {
    slug: 'openrouter/free',
    name: 'OpenRouter Free router',
    provider: 'OpenRouter',
    summary: 'Rotates among currently available free models; useful for trials, not a reliability default.',
    badges: ['Free', 'Variable']
  },
  {
    slug: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic via OpenRouter',
    summary: 'Fast classifier with good extraction quality.',
    badges: ['Fast']
  },
  {
    slug: 'google/gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'Google via OpenRouter',
    summary: 'Low-latency and low-cost option for bulk processing.',
    badges: ['Cheap']
  },
  {
    slug: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'Google via OpenRouter',
    summary: 'Good general-purpose flash model.',
    badges: ['General']
  },
  {
    slug: 'minimax/minimax-m2.7',
    name: 'MiniMax M2.7',
    provider: 'MiniMax via OpenRouter',
    summary: 'Alternative fast cloud option for classification-heavy workloads.',
    badges: ['Alt']
  },
  {
    slug: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    provider: 'Google via OpenRouter',
    summary: 'Open-weight leaning model with strong instruction following.',
    badges: ['Open']
  },
  {
    slug: 'qwen/qwen3.5-flash-02-23',
    name: 'Qwen 3.5 Flash',
    provider: 'Qwen via OpenRouter',
    summary: 'Fast multilingual option for mixed document sets.',
    badges: ['Multilingual']
  },
  {
    slug: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'Moonshot via OpenRouter',
    summary: 'High-capability alternative for harder extractions.',
    badges: ['Long context']
  }
];

const DEFAULT_MODELS = {
  openrouter: 'openai/gpt-5.4-mini',
  ollama: 'llama3.2',
  'ollama-cloud': 'gpt-oss:20b-cloud',
  opencode: 'deepseek-v4-flash',
  copilot: 'gpt-5.4-mini',
  compatible: '',
  openai: 'gpt-5.4-mini',
  azure: '',
  anthropic: 'claude-haiku-4-5',
  codex: 'gpt-5.4-mini'
};

function normalizeOpenAIModel(model?: string, env: EnvLike = process.env) {
  return model?.trim() || DEFAULT_MODELS.openai;
}

function normalizeProvider(provider?: string): ProviderId {
  if (!provider) return 'openrouter';
  if (provider === 'custom') return 'compatible';
  return (PROVIDER_IDS as readonly string[]).includes(provider)
    ? provider as ProviderId
    : 'openrouter';
}

function getDefaultModel(provider?: string) {
  return DEFAULT_MODELS[normalizeProvider(provider)] || '';
}

function getOpenRouterPresets() {
  return OPENROUTER_PRESETS;
}

function getProviderList() {
  return providerRegistry.getProviderDefinitions().map((provider: {
    id: string;
    name: string;
    description: string;
    recommended?: boolean;
    discovery: string;
    manualModelInput: boolean;
  }) => ({
    id: provider.id,
    name: provider.name,
    description: provider.description,
    recommended: Boolean(provider.recommended),
    supportsModelDiscovery: provider.discovery !== 'manual',
    supportsCustomModelSlug: provider.manualModelInput
  }));
}

function getPresetBySlug(slug?: string) {
  return OPENROUTER_PRESETS.find((preset) => preset.slug === slug) || null;
}

function getEffectiveModel(env: EnvLike = process.env) {
  const provider = normalizeProvider(env.AI_PROVIDER);
  const definition = providerRegistry.getProviderDefinition(provider);
  const configured = definition ? providerRegistry.getConfiguredModel(definition, env) : '';
  return configured || getDefaultModel(provider);
}

function buildCatalog(currentConfig: EnvLike = {}) {
  const selectedProvider = normalizeProvider(currentConfig.AI_PROVIDER);
  const effectiveModel = getEffectiveModel(currentConfig);

  return {
    recommendedProvider: 'openrouter',
    recommendedModel: 'openai/gpt-5.4-mini',
    providers: getProviderList().map((provider: { id: ProviderId }) => ({
      ...provider,
      selected: provider.id === selectedProvider,
      defaultModel: getDefaultModel(provider.id)
    })),
    openrouterPresets: OPENROUTER_PRESETS,
    selectedProvider,
    effectiveModel,
    selectedPreset: getPresetBySlug(effectiveModel)
  };
}

export = {
  buildCatalog,
  getDefaultModel,
  getEffectiveModel,
  normalizeOpenAIModel,
  getOpenRouterPresets,
  getPresetBySlug,
  getProviderList,
  normalizeProvider
};
