const path = require('path');
const fs = require('fs');
const {
  getDefaultModel,
  getEffectiveModel,
  normalizeOpenAIModel,
  normalizeProvider
} = require('../services/providerCatalogService');
const { resolveEnv } = require('../services/configHelpers');
const { resolveDataDirectory } = require('../services/dataDirectory');
const currentDir = decodeURIComponent(process.cwd());
const dataDir = resolveDataDirectory();
let packageVersion = '3.0.0';
try {
  packageVersion = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), 'package.json'), 'utf8')).version || packageVersion;
} catch {
  // The built-in version remains available in minimal runtime bundles.
}
const envPath = path.join(dataDir, '.env');
const injectedEnvironment = new Set(Object.keys(process.env));
require('dotenv').config({ path: envPath, override: false });

// Helper function to parse boolean-like env vars
const parseEnvBoolean = (value: string | undefined, defaultValue = 'yes') => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes' ? 'yes' : 'no';
};
const { normalizeProcessingMode } = require('../services/processingMode');
const tagvicoAiVersion = resolveEnv('TAGVICO_AI_VERSION', 'ARCHIVISTA_AI_VERSION') || packageVersion;

const parsePositiveInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

// Initialize limit functions with defaults
const limitFunctions = {
  activateTagging: parseEnvBoolean(process.env.ACTIVATE_TAGGING, 'yes'),
  activateCorrespondents: parseEnvBoolean(process.env.ACTIVATE_CORRESPONDENTS, 'yes'),
  activateDocumentType: parseEnvBoolean(process.env.ACTIVATE_DOCUMENT_TYPE, 'yes'),
  activateTitle: parseEnvBoolean(process.env.ACTIVATE_TITLE, 'yes'),
  activateCustomFields: parseEnvBoolean(process.env.ACTIVATE_CUSTOM_FIELDS, 'yes')
};

// Initialize AI restrictions with defaults
const aiRestrictions = {
  restrictToExistingTags: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_TAGS, 'no'),
  restrictToExistingCorrespondents: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_CORRESPONDENTS, 'no'),
  restrictToExistingDocumentTypes: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES, 'no')
};

// Initialize external API configuration
const externalApiConfig = {
  enabled: parseEnvBoolean(process.env.EXTERNAL_API_ENABLED, 'no'),
  url: process.env.EXTERNAL_API_URL || '',
  method: process.env.EXTERNAL_API_METHOD || 'GET',
  headers: process.env.EXTERNAL_API_HEADERS || '{}',
  body: process.env.EXTERNAL_API_BODY || '{}',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || '5000', 10),
  selector: process.env.EXTERNAL_API_TRANSFORM || ''
};

module.exports = {
  TAGVICO_AI_VERSION: tagvicoAiVersion,
  CONFIGURED: false,
  disableAutomaticProcessing: process.env.DISABLE_AUTOMATIC_PROCESSING || 'no',
  predefinedMode: process.env.PROCESS_PREDEFINED_DOCUMENTS,
  tokenLimit: process.env.TOKEN_LIMIT || 128000,
  responseTokens: process.env.RESPONSE_TOKENS || 1000,
  minContentLength: Math.max(1, parseInt(process.env.MIN_CONTENT_LENGTH || '10', 10)),
  maxRetries: Math.max(1, parseInt(process.env.AI_MAX_RETRIES || '3', 10)),
  ignoreTags: process.env.IGNORE_TAGS || '',
  tagGroupsJson: process.env.TAG_GROUPS_JSON || '',
  controlledTaggingEnabled: parseEnvBoolean(process.env.CONTROLLED_TAGGING_ENABLED, 'no'),
  tagMaxPerDocument: Math.min(10, Math.max(1, parseInt(process.env.TAG_MAX_PER_DOCUMENT || '3', 10) || 3)),
  tagCacheTtlSeconds: Math.max(30, parseInt(process.env.TAG_CACHE_TTL_SECONDS || '300', 10)),
  reconciliationEnabled: parseEnvBoolean(process.env.RECONCILIATION_ENABLED, 'yes'),
  reconciliationInterval: process.env.RECONCILIATION_INTERVAL || '0 * * * *',
  processingMode: normalizeProcessingMode(process.env.AI_PROCESSING_MODE, process.env.AI_PROVIDER),
  addAIProcessedTag: process.env.ADD_AI_PROCESSED_TAG || 'no',
  addAIProcessedTags: process.env.AI_PROCESSED_TAG_NAME || 'ai-processed',
  activateOwnerAssignment: parseEnvBoolean(process.env.ACTIVATE_OWNER_ASSIGNMENT, 'yes'),
  ownerProfiles: process.env.OWNER_PROFILES || '',
  // AI restrictions config
  restrictToExistingTags: aiRestrictions.restrictToExistingTags,
  restrictToExistingCorrespondents: aiRestrictions.restrictToExistingCorrespondents,
  restrictToExistingDocumentTypes: aiRestrictions.restrictToExistingDocumentTypes,
  // External API config
  externalApiConfig: externalApiConfig,
  paperless: {
    apiUrl: process.env.PAPERLESS_API_URL,
    apiToken: process.env.PAPERLESS_API_TOKEN
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: normalizeOpenAIModel(process.env.OPENAI_MODEL || getDefaultModel('openai'))
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
  },
  codex: {
    model: process.env.CODEX_MODEL || 'gpt-5.4-mini',
    home: process.env.CODEX_HOME || path.join(dataDir, 'codex'),
    timeoutMs: Math.max(10000, parseInt(process.env.CODEX_TIMEOUT_MS || '120000', 10))
  },
  ocr: {
    enabled: parseEnvBoolean(process.env.OCR_ENABLED || process.env.MISTRAL_OCR_ENABLED, 'no'),
    provider: String(process.env.OCR_PROVIDER || 'mistral').trim().toLowerCase(),
    apiUrl: String(process.env.OCR_API_URL || '').trim(),
    apiKey: process.env.OCR_API_KEY || process.env.MISTRAL_API_KEY || '',
    model: process.env.OCR_MODEL || process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
    maxPages: Math.max(1, parseInt(process.env.OCR_MAX_PAGES || '20', 10)),
    maxFileBytes: parsePositiveInteger(process.env.OCR_MAX_FILE_BYTES, 50 * 1024 * 1024, 100 * 1024 * 1024),
    timeoutMs: Math.max(10000, parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10))
  },
  telegram: {
    enabled: parseEnvBoolean(process.env.TELEGRAM_BOT_ENABLED, 'no'),
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    usersJson: process.env.TELEGRAM_USERS_JSON || '[]',
    pollTimeoutSeconds: parsePositiveInteger(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS, 30, 50),
    uploadTimeoutSeconds: parsePositiveInteger(process.env.TELEGRAM_UPLOAD_TIMEOUT_SECONDS, 180, 900),
    maxDocuments: parsePositiveInteger(process.env.TELEGRAM_MAX_DOCUMENTS, 8, 20),
    historyTurns: parsePositiveInteger(process.env.TELEGRAM_HISTORY_TURNS, 6, 20),
    maxFileBytes: parsePositiveInteger(process.env.TELEGRAM_MAX_FILE_BYTES, 20 * 1024 * 1024, 20 * 1024 * 1024),
    automaticUploadMetadata: parseEnvBoolean(process.env.TELEGRAM_UPLOAD_AUTOMATIC_METADATA, 'no')
  },
  injectedEnvironment,
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || process.env.AI_MODEL || getDefaultModel('openrouter'),
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || getDefaultModel('ollama')
  },
  ollamaCloud: {
    apiKey: process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '',
    apiUrl: process.env.OLLAMA_CLOUD_API_URL || 'https://ollama.com',
    model: process.env.OLLAMA_CLOUD_MODEL || getDefaultModel('ollama-cloud')
  },
  opencode: {
    apiKey: process.env.OPENCODE_API_KEY || '',
    apiUrl: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
    model: process.env.OPENCODE_MODEL || getDefaultModel('opencode')
  },
  copilot: {
    githubToken: process.env.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '',
    model: process.env.COPILOT_MODEL || getDefaultModel('copilot'),
    home: process.env.COPILOT_HOME || path.join(dataDir, 'copilot'),
    timeoutMs: Math.max(10000, parseInt(process.env.COPILOT_TIMEOUT_MS || '120000', 10))
  },
  compatible: {
    apiUrl: process.env.COMPATIBLE_BASE_URL || process.env.CUSTOM_BASE_URL || '',
    apiKey: process.env.COMPATIBLE_API_KEY || process.env.CUSTOM_API_KEY || '',
    model: process.env.COMPATIBLE_MODEL || process.env.CUSTOM_MODEL || ''
  },
  custom: {
    apiUrl: process.env.COMPATIBLE_BASE_URL || process.env.CUSTOM_BASE_URL || '',
    apiKey: process.env.COMPATIBLE_API_KEY || process.env.CUSTOM_API_KEY || '',
    model: process.env.COMPATIBLE_MODEL || process.env.CUSTOM_MODEL || ''
  },
  azure: {
    apiKey: process.env.AZURE_API_KEY || '',
    endpoint: process.env.AZURE_ENDPOINT || '',
    deploymentName: process.env.AZURE_DEPLOYMENT_NAME || '',
    apiVersion: process.env.AZURE_API_VERSION || '2023-05-15'
  },
  customFields: process.env.CUSTOM_FIELDS || '',
  aiProvider: normalizeProvider(process.env.AI_PROVIDER || 'openrouter'),
  aiModel: getEffectiveModel(process.env),
  scanInterval: process.env.SCAN_INTERVAL || '*/30 * * * *',
  useExistingData: process.env.USE_EXISTING_DATA || 'no',
  // Add limit functions to config
  limitFunctions: {
    activateTagging: limitFunctions.activateTagging,
    activateCorrespondents: limitFunctions.activateCorrespondents,
    activateDocumentType: limitFunctions.activateDocumentType,
    activateTitle: limitFunctions.activateTitle,
    activateCustomFields: limitFunctions.activateCustomFields
  },
  specialPromptPreDefinedTags: `You are a document analysis AI. You will analyze the document. 
  You take the main information to associate tags with the document. 
  You will also find the correspondent of the document (Sender not receiver). Also you find a meaningful and short title for the document.
  You are given a list of tags: ${process.env.PROMPT_TAGS}
  Only use the tags from the list and try to find the best fitting tags.
  You do not ask for additional information, you only use the information given in the document.
  
  Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/..."
  }`,
  mustHavePrompt: `  Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
  IMPORTANT: The custom_fields are optional and can be left out if not needed, only try to fill out the values if you find a matching information in the document.
  Do not change the value of field_name, only fill out the values. If the field is about money only add the number without currency and always use a . for decimal places.
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_type": "Invoice/Contract/...",
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/...",
    %CUSTOMFIELDS%
  }`,
};
