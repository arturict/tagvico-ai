const {
  getDefaultModel,
  getEffectiveModel,
  normalizeOpenAIModel,
  normalizeProvider
} = require('./providerCatalogService');

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function serializeArray(value) {
  return normalizeArray(value).join(',');
}

function processSystemPrompt(prompt) {
  if (!prompt) return '';
  return String(prompt).replace(/\r\n/g, '\n').replace(/=/g, '').trim();
}

function parseBooleanFlag(value, fallback = 'no') {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  const normalized = String(value).toLowerCase();
  return ['yes', 'true', '1', 'on'].includes(normalized) ? 'yes' : 'no';
}

function buildUiConfig(env = process.env, version = '') {
  const provider = normalizeProvider(env.AI_PROVIDER);
  const effectiveModel = getEffectiveModel(env);

  return {
    PAPERLESS_API_URL: (env.PAPERLESS_API_URL || 'http://localhost:8000').replace(/\/api$/, ''),
    PAPERLESS_API_TOKEN: env.PAPERLESS_API_TOKEN || '',
    PAPERLESS_USERNAME: env.PAPERLESS_USERNAME || '',
    AI_PROVIDER: provider,
    AI_MODEL: env.AI_MODEL || effectiveModel,
    OPENAI_API_KEY: env.OPENAI_API_KEY || '',
    OPENAI_MODEL: normalizeOpenAIModel(env.OPENAI_MODEL || getDefaultModel('openai')),
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || '',
    OPENROUTER_MODEL: env.OPENROUTER_MODEL || env.AI_MODEL || getDefaultModel('openrouter'),
    OLLAMA_API_URL: env.OLLAMA_API_URL || 'http://localhost:11434',
    OLLAMA_MODEL: env.OLLAMA_MODEL || getDefaultModel('ollama'),
    COMPATIBLE_API_KEY: env.COMPATIBLE_API_KEY || env.CUSTOM_API_KEY || '',
    COMPATIBLE_BASE_URL: env.COMPATIBLE_BASE_URL || env.CUSTOM_BASE_URL || '',
    COMPATIBLE_MODEL: env.COMPATIBLE_MODEL || env.CUSTOM_MODEL || '',
    AZURE_ENDPOINT: env.AZURE_ENDPOINT || '',
    AZURE_API_KEY: env.AZURE_API_KEY || '',
    AZURE_DEPLOYMENT_NAME: env.AZURE_DEPLOYMENT_NAME || '',
    AZURE_API_VERSION: env.AZURE_API_VERSION || '',
    SCAN_INTERVAL: env.SCAN_INTERVAL || '*/30 * * * *',
    PROCESS_PREDEFINED_DOCUMENTS: parseBooleanFlag(env.PROCESS_PREDEFINED_DOCUMENTS, 'no'),
    TAGS: normalizeArray(env.TAGS),
    ADD_AI_PROCESSED_TAG: parseBooleanFlag(env.ADD_AI_PROCESSED_TAG, 'no'),
    AI_PROCESSED_TAG_NAME: env.AI_PROCESSED_TAG_NAME || 'ai-processed',
    USE_EXISTING_DATA: parseBooleanFlag(env.USE_EXISTING_DATA, 'no'),
    DISABLE_AUTOMATIC_PROCESSING: parseBooleanFlag(env.DISABLE_AUTOMATIC_PROCESSING, 'no'),
    ACTIVATE_TAGGING: parseBooleanFlag(env.ACTIVATE_TAGGING, 'yes'),
    ACTIVATE_CORRESPONDENTS: parseBooleanFlag(env.ACTIVATE_CORRESPONDENTS, 'yes'),
    ACTIVATE_DOCUMENT_TYPE: parseBooleanFlag(env.ACTIVATE_DOCUMENT_TYPE, 'yes'),
    ACTIVATE_TITLE: parseBooleanFlag(env.ACTIVATE_TITLE, 'yes'),
    ACTIVATE_CUSTOM_FIELDS: parseBooleanFlag(env.ACTIVATE_CUSTOM_FIELDS, 'yes'),
    ACTIVATE_OWNER_ASSIGNMENT: parseBooleanFlag(env.ACTIVATE_OWNER_ASSIGNMENT, 'yes'),
    OWNER_PROFILES: env.OWNER_PROFILES || '',
    RESTRICT_TO_EXISTING_TAGS: parseBooleanFlag(env.RESTRICT_TO_EXISTING_TAGS, 'no'),
    RESTRICT_TO_EXISTING_CORRESPONDENTS: parseBooleanFlag(env.RESTRICT_TO_EXISTING_CORRESPONDENTS, 'no'),
    RESTRICT_TO_EXISTING_DOCUMENT_TYPES: parseBooleanFlag(env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES, 'no'),
    EXTERNAL_API_ENABLED: parseBooleanFlag(env.EXTERNAL_API_ENABLED, 'no'),
    EXTERNAL_API_URL: env.EXTERNAL_API_URL || '',
    EXTERNAL_API_METHOD: env.EXTERNAL_API_METHOD || 'GET',
    EXTERNAL_API_HEADERS: env.EXTERNAL_API_HEADERS || '{}',
    EXTERNAL_API_BODY: env.EXTERNAL_API_BODY || '{}',
    EXTERNAL_API_TIMEOUT: env.EXTERNAL_API_TIMEOUT || '5000',
    EXTERNAL_API_TRANSFORM: env.EXTERNAL_API_TRANSFORM || '',
    CUSTOM_FIELDS: env.CUSTOM_FIELDS || '{"custom_fields":[]}',
    API_KEY: env.API_KEY || '',
    AI_REASONING_EFFORT: env.AI_REASONING_EFFORT || 'low',
    PAPERLESS_AI_VERSION: version,
    SYSTEM_PROMPT: ''
  };
}

function normalizeProviderPayload(payload = {}) {
  const provider = normalizeProvider(payload.aiProvider || payload.AI_PROVIDER);
  let selectedModel =
    payload.aiModel ||
    payload.openrouterModel ||
    payload.ollamaModel ||
    payload.compatibleModel ||
    payload.openaiModel ||
    payload.customModel ||
    payload.OPENROUTER_MODEL ||
    payload.OLLAMA_MODEL ||
    payload.COMPATIBLE_MODEL ||
    payload.OPENAI_MODEL ||
    payload.CUSTOM_MODEL ||
    getDefaultModel(provider);

  if (provider === 'openai') {
    selectedModel = normalizeOpenAIModel(selectedModel);
  }

  return {
    provider,
    selectedModel,
    openrouterApiKey: payload.openrouterApiKey || payload.OPENROUTER_API_KEY || payload.openaiKey || payload.OPENAI_API_KEY || '',
    ollamaUrl: payload.ollamaUrl || payload.OLLAMA_API_URL || 'http://localhost:11434',
    compatibleBaseUrl: payload.compatibleBaseUrl || payload.COMPATIBLE_BASE_URL || payload.customBaseUrl || payload.CUSTOM_BASE_URL || '',
    compatibleApiKey: payload.compatibleApiKey || payload.COMPATIBLE_API_KEY || payload.customApiKey || payload.CUSTOM_API_KEY || '',
    openaiApiKey: payload.openaiKey || payload.OPENAI_API_KEY || '',
    azureEndpoint: payload.azureEndpoint || payload.AZURE_ENDPOINT || '',
    azureApiKey: payload.azureApiKey || payload.AZURE_API_KEY || '',
    azureDeploymentName: payload.azureDeploymentName || payload.AZURE_DEPLOYMENT_NAME || '',
    azureApiVersion: payload.azureApiVersion || payload.AZURE_API_VERSION || ''
  };
}

module.exports = {
  buildUiConfig,
  normalizeArray,
  normalizeProviderPayload,
  parseBooleanFlag,
  processSystemPrompt,
  serializeArray
};
