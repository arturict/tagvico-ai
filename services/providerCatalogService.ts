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

const OPENAI_DIRECT_MODELS = [
  { slug: 'gpt-5.5', name: 'GPT-5.5' },
  { slug: 'gpt-5.4', name: 'GPT-5.4' },
  { slug: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  { slug: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
  { slug: 'gpt-5.3', name: 'GPT-5.3' }
];

// GPT-5.6 is a trusted-partner preview. Keep the slugs available for accounts
// that explicitly opt in, but never make them the default for ordinary API or
// ChatGPT subscription users.
const OPENAI_PREVIEW_MODELS = [
  { slug: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', preview: true },
  { slug: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', preview: true },
  { slug: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', preview: true, recommended: true }
];

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Curated cloud models with a clean preset picker and custom slug support.',
    recommended: true,
    supportsModelDiscovery: false,
    supportsCustomModelSlug: true
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local or remote Ollama instances with model discovery from the instance itself.',
    supportsModelDiscovery: true,
    supportsCustomModelSlug: true
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    description: 'Ollama cloud inference with an Ollama API key; no local GPU required.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: true
  },
  {
    id: 'opencode',
    name: 'OpenCode Go',
    description: 'OpenCode Console inference with a service API key and OpenAI-compatible gateway.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: true
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Uses the official Copilot SDK, OAuth device login, and the models exposed by your plan.',
    supportsModelDiscovery: true,
    supportsCustomModelSlug: false
  },
  {
    id: 'compatible',
    name: 'OpenAI-Compatible',
    description: 'LM Studio, LiteLLM, vLLM, FastChat, custom gateways, and similar APIs.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: true
  },
  {
    id: 'openai',
    name: 'OpenAI Direct',
    description: 'Native OpenAI API with a locked, supported model list.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: false
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'Legacy Azure OpenAI support for existing setups.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: false
  },
  {
    id: 'anthropic',
    name: 'Anthropic Direct',
    description: 'Claude with standard or discounted asynchronous Message Batches.',
    supportsModelDiscovery: false,
    supportsCustomModelSlug: true
  },
  {
    id: 'codex',
    name: 'ChatGPT subscription (experimental)',
    description: 'Uses a ChatGPT device login and lists only models returned for the signed-in plan.',
    supportsModelDiscovery: true,
    supportsCustomModelSlug: false
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

function isPreviewEnabled(env: EnvLike = process.env) {
  return ['yes', 'true', '1', 'on'].includes(String(env.OPENAI_ENABLE_GPT_5_6_PREVIEW || '').toLowerCase());
}

function getOpenAIDirectModels(env: EnvLike = process.env) {
  return isPreviewEnabled(env) ? [...OPENAI_DIRECT_MODELS, ...OPENAI_PREVIEW_MODELS] : OPENAI_DIRECT_MODELS;
}

function normalizeOpenAIModel(model?: string, env: EnvLike = process.env) {
  const allowed = new Set(getOpenAIDirectModels(env).map((entry) => entry.slug));
  return model && allowed.has(model) ? model : DEFAULT_MODELS.openai;
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
  return PROVIDERS;
}

function getPresetBySlug(slug?: string) {
  return OPENROUTER_PRESETS.find((preset) => preset.slug === slug) || null;
}

function getEffectiveModel(env: EnvLike = process.env) {
  const provider = normalizeProvider(env.AI_PROVIDER);

  switch (provider) {
    case 'openrouter':
      return env.OPENROUTER_MODEL || env.AI_MODEL || env.OPENAI_MODEL || getDefaultModel(provider);
    case 'ollama':
      return env.OLLAMA_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'ollama-cloud':
      return env.OLLAMA_CLOUD_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'opencode':
      return env.OPENCODE_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'copilot':
      return env.COPILOT_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'compatible':
      return env.COMPATIBLE_MODEL || env.CUSTOM_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'openai':
      return normalizeOpenAIModel(env.OPENAI_MODEL || env.AI_MODEL || getDefaultModel(provider), env);
    case 'azure':
      return env.AZURE_DEPLOYMENT_NAME || getDefaultModel(provider);
    case 'anthropic':
      return env.ANTHROPIC_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'codex':
      return env.CODEX_MODEL || env.AI_MODEL || getDefaultModel(provider);
    default:
      return env.AI_MODEL || getDefaultModel(provider);
  }
}

function buildCatalog(currentConfig: EnvLike = {}) {
  const selectedProvider = normalizeProvider(currentConfig.AI_PROVIDER);
  const effectiveModel = currentConfig.AI_MODEL || getEffectiveModel(currentConfig);

  return {
    recommendedProvider: 'openrouter',
    recommendedModel: 'openai/gpt-5.4-mini',
    providers: PROVIDERS.map((provider) => ({
      ...provider,
      selected: provider.id === selectedProvider,
      defaultModel: getDefaultModel(provider.id)
    })),
    openrouterPresets: OPENROUTER_PRESETS,
    openaiDirectModels: getOpenAIDirectModels(currentConfig),
    openaiPreviewAvailable: isPreviewEnabled(currentConfig),
    selectedProvider,
    effectiveModel,
    selectedPreset: getPresetBySlug(effectiveModel)
  };
}

export = {
  buildCatalog,
  getDefaultModel,
  getEffectiveModel,
  getOpenAIDirectModels,
  isPreviewEnabled,
  normalizeOpenAIModel,
  getOpenRouterPresets,
  getPresetBySlug,
  getProviderList,
  normalizeProvider
};
