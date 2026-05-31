const OPENROUTER_PRESETS = [
  {
    slug: 'openai/gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'OpenAI via OpenRouter',
    summary: 'Recommended default from the maintainer: fast, cheap, and strong enough for filing.',
    badges: ['Recommended', 'Fast'],
    recommended: true,
    reasoning: 'low'
  },
  {
    slug: 'openai/gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'OpenAI via OpenRouter',
    summary: 'More headroom for tricky documents while staying efficient.',
    badges: ['Balanced'],
    reasoning: 'low'
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
  }
];

const DEFAULT_MODELS = {
  openrouter: 'openai/gpt-5.4-nano',
  ollama: 'llama3.2',
  compatible: '',
  openai: 'gpt-5.4-mini',
  azure: ''
};

function normalizeOpenAIModel(model) {
  const allowed = new Set(OPENAI_DIRECT_MODELS.map((entry) => entry.slug));
  return allowed.has(model) ? model : DEFAULT_MODELS.openai;
}

function normalizeProvider(provider) {
  if (!provider) return 'openrouter';
  if (provider === 'custom') return 'compatible';
  return provider;
}

function getDefaultModel(provider) {
  return DEFAULT_MODELS[normalizeProvider(provider)] || '';
}

function getOpenRouterPresets() {
  return OPENROUTER_PRESETS;
}

function getProviderList() {
  return PROVIDERS;
}

function getPresetBySlug(slug) {
  return OPENROUTER_PRESETS.find((preset) => preset.slug === slug) || null;
}

function getEffectiveModel(env = process.env) {
  const provider = normalizeProvider(env.AI_PROVIDER);

  switch (provider) {
    case 'openrouter':
      return env.OPENROUTER_MODEL || env.AI_MODEL || env.OPENAI_MODEL || getDefaultModel(provider);
    case 'ollama':
      return env.OLLAMA_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'compatible':
      return env.COMPATIBLE_MODEL || env.CUSTOM_MODEL || env.AI_MODEL || getDefaultModel(provider);
    case 'openai':
      return normalizeOpenAIModel(env.OPENAI_MODEL || env.AI_MODEL || getDefaultModel(provider));
    case 'azure':
      return env.AZURE_DEPLOYMENT_NAME || getDefaultModel(provider);
    default:
      return env.AI_MODEL || getDefaultModel(provider);
  }
}

function buildCatalog(currentConfig = {}) {
  const selectedProvider = normalizeProvider(currentConfig.AI_PROVIDER);
  const effectiveModel = currentConfig.AI_MODEL || getEffectiveModel(currentConfig);

  return {
    recommendedProvider: 'openrouter',
    recommendedModel: 'openai/gpt-5.4-nano',
    providers: PROVIDERS.map((provider) => ({
      ...provider,
      selected: provider.id === selectedProvider,
      defaultModel: getDefaultModel(provider.id)
    })),
    openrouterPresets: OPENROUTER_PRESETS,
    openaiDirectModels: OPENAI_DIRECT_MODELS,
    selectedProvider,
    effectiveModel,
    selectedPreset: getPresetBySlug(effectiveModel)
  };
}

module.exports = {
  buildCatalog,
  getDefaultModel,
  getEffectiveModel,
  normalizeOpenAIModel,
  getOpenRouterPresets,
  getPresetBySlug,
  getProviderList,
  normalizeProvider
};
