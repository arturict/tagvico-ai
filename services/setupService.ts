import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { PAPERLESS_ACCEPT } from './paperlessApi';
import { AzureOpenAI, OpenAI } from 'openai';
import type { ChatCompletionReasoningEffort } from 'openai/resources/chat/completions';
import dotenv from 'dotenv';
import { resolveDataDirectory } from './dataDirectory';
import { chatCompletionsToolReasoningEffort, isOpenAIReasoningModel as isReasoningModel } from './openaiModelParameters';
const runtimeConfig = require('../config/config');
const { normalizeProvider } = require('./providerCatalogService');

type SetupConfig = Record<string, string>;
const SETUP_VALIDATION_TIMEOUT_MS = 15_000;
const SETUP_TOOL_NAME = 'confirm_tagvico_tool_support';
const SETUP_TOOL_REASONING_TOKEN_BUDGET = 2048;
const SETUP_TOOL_STANDARD_TOKEN_BUDGET = 64;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tokenLimitParam(
  model: string,
  forceCompletionTokens = false,
  forceStandardTokens = false
) {
  if (forceStandardTokens) {
    return { max_tokens: SETUP_TOOL_STANDARD_TOKEN_BUDGET };
  }
  return forceCompletionTokens || isReasoningModel(model)
    ? { max_completion_tokens: SETUP_TOOL_REASONING_TOKEN_BUDGET }
    : { max_tokens: SETUP_TOOL_STANDARD_TOKEN_BUDGET };
}

function toolValidationRequest(
  model: string,
  options: {
    forceCompletionTokens?: boolean;
    forceStandardTokens?: boolean;
    reasoningEffort?: boolean;
  } = {}
) {
  const reasoningModel = isReasoningModel(model);
  return {
    model,
    messages: [{
      role: 'user' as const,
      content: 'Call confirm_tagvico_tool_support with supported set to true.'
    }],
    tools: [{
      type: 'function' as const,
      function: {
        name: SETUP_TOOL_NAME,
        description: 'Confirms that the selected model can call tools required by Tagvico.',
        parameters: {
          type: 'object',
          properties: { supported: { type: 'boolean' } },
          required: ['supported'],
          additionalProperties: false
        }
      }
    }],
    tool_choice: {
      type: 'function' as const,
      function: { name: SETUP_TOOL_NAME }
    },
    ...tokenLimitParam(model, options.forceCompletionTokens, options.forceStandardTokens),
    ...(reasoningModel && options.reasoningEffort
      // The pinned openai 4.x types predate the "none" effort that GPT-6 Luna
      // and Sol need here; the API accepts it.
      ? { reasoning_effort: chatCompletionsToolReasoningEffort(model) as ChatCompletionReasoningEffort }
      : {})
  };
}

function hasSetupToolCall(response: unknown): boolean {
  const choices = (response as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
      };
    }>;
  } | null)?.choices;
  return Boolean(choices?.some((choice) => choice.message?.tool_calls?.some(
    (tool) => tool.function?.name === SETUP_TOOL_NAME
      && hasSupportedSetupArguments(tool.function.arguments)
  )));
}

function hasSupportedSetupArguments(value: unknown): boolean {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  return record.supported === true
    && Object.keys(record).length === 1;
}

class SetupService {
  private readonly envPath: string;
  private readonly injectedEnvironmentKeys: Set<string>;
  private persistedEnvironmentKeys: Set<string>;
  private configured: boolean | null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.envPath = path.join(resolveDataDirectory(), '.env');
    this.injectedEnvironmentKeys = new Set(
      runtimeConfig.injectedEnvironment instanceof Set
        ? [...runtimeConfig.injectedEnvironment]
        : []
    );
    this.persistedEnvironmentKeys = new Set(Object.keys(this.readPersistedEnvironment() || {}));
    this.configured = null; // Variable to store the configuration status
  }

  private readPersistedEnvironment(): SetupConfig | null {
    try {
      return dotenv.parse(readFileSync(this.envPath, 'utf8'));
    } catch {
      return null;
    }
  }

  async loadConfig(): Promise<SetupConfig | null> {
    try {
      const envContent = await fs.readFile(this.envPath, 'utf8');
      return dotenv.parse(envContent);
    } catch (error) {
      console.error('Error loading config:', errorMessage(error));
      return null;
    }
  }

  async validatePaperlessConfig(url: string, token: string): Promise<boolean> {
    try {
      const baseUrl = String(url || '').replace(/\/+$/, '').replace(/\/api$/i, '');
      console.log('Validating Paperless config for:', baseUrl + '/api/documents/');
      const response = await axios.get(`${baseUrl}/api/documents/`, {
        timeout: SETUP_VALIDATION_TIMEOUT_MS,
        headers: {
          'Authorization': `Token ${token}`,
          Accept: PAPERLESS_ACCEPT
        }
      });
      return response.status === 200;
    } catch (error) {
      console.error('Paperless validation error:', errorMessage(error));
      return false;
    }
  }

  async validateApiPermissions(url: string, token: string) {
    const baseUrl = String(url || '').replace(/\/+$/, '').replace(/\/api$/i, '');
    const checks = await Promise.all(
      ['correspondents', 'tags', 'documents', 'document_types', 'custom_fields', 'users'].map(async (endpoint) => {
        try {
          console.log(`Validating API permissions for ${baseUrl}/api/${endpoint}/`);
          const response = await axios.get(`${baseUrl}/api/${endpoint}/`, {
            timeout: SETUP_VALIDATION_TIMEOUT_MS,
            headers: {
              'Authorization': `Token ${token}`,
              Accept: PAPERLESS_ACCEPT
            }
          });
          console.log(`API permissions validated for ${endpoint}, ${response.status}`);
          if (response.status !== 200) {
            console.error(`API permissions validation failed for ${endpoint}`);
            return endpoint;
          }
        } catch (error) {
          console.error(`API permissions validation failed for ${endpoint}:`, errorMessage(error));
          return endpoint;
        }
        return null;
      })
    );
    const failedEndpoint = checks.find(Boolean);
    if (failedEndpoint) {
      return {
        success: false,
        message: `API permissions validation failed for endpoint '/api/${failedEndpoint}/'`
      };
    }
    return { success: true, message: 'API permissions validated successfully' };
  }


  async validateOpenAIConfig(apiKey?: string, selectedModel?: string): Promise<boolean> {
    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey, timeout: SETUP_VALIDATION_TIMEOUT_MS });
        const model = selectedModel || process.env.OPENAI_MODEL || 'gpt-5.4-nano';
        const response = await openai.chat.completions.create(toolValidationRequest(
          model,
          { reasoningEffort: true }
        ));
        const now = new Date();
        const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
        return hasSetupToolCall(response);
      } catch (error) {
        console.error('OpenAI validation error:', errorMessage(error));
        return false;
      }
    }
    return false;
  }

  async validateOpenRouterConfig(
    apiKey?: string,
    model = 'openai/gpt-5.4-nano',
    baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  ): Promise<boolean> {
    if (!apiKey) {
      return false;
    }

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        timeout: SETUP_VALIDATION_TIMEOUT_MS,
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/arturict/tagvico-ai',
          'X-Title': 'Tagvico AI'
        }
      });

      const response = await openai.chat.completions.create(toolValidationRequest(
        model,
        { reasoningEffort: true }
      ));

      return hasSetupToolCall(response);
    } catch (error) {
      console.error('OpenRouter validation error:', errorMessage(error));
      return false;
    }
  }

  async validateCustomConfig(url: string, apiKey: string | undefined, model: string) {
    const config = {
      baseURL: url,
      apiKey: apiKey || 'Tagvico AI-compatible',
      model: model
    };
    console.log('Validating OpenAI-compatible endpoint:', {
      baseURL: config.baseURL,
      model: config.model,
      hasApiKey: Boolean(apiKey)
    });
    try {
      const openai = new OpenAI({ 
        apiKey: config.apiKey, 
        baseURL: config.baseURL,
        timeout: SETUP_VALIDATION_TIMEOUT_MS
      });
      const completion = await openai.chat.completions.create(toolValidationRequest(config.model));
      return hasSetupToolCall(completion);
    } catch (error) {
      console.error('Custom AI validation error:', errorMessage(error));
      return false;
    }
  }

  async getOllamaModels(url: string, apiKey = '') {
    try {
      const response = await axios.get(`${url.replace(/\/$/, '')}/api/tags`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
      });
      return Array.isArray(response.data?.models) ? response.data.models : [];
    } catch (error) {
      console.error('Failed to fetch Ollama models:', errorMessage(error));
      return [];
    }
  }



  async validateOllamaConfig(url: string, model?: string, apiKey = '') {
    try {
      const response = await axios.post(`${url.replace(/\/$/, '')}/api/chat`, {
        model: model || 'llama3.2',
        messages: [{
          role: 'user',
          content: `Call ${SETUP_TOOL_NAME} with supported set to true.`
        }],
        tools: [{
          type: 'function',
          function: {
            name: SETUP_TOOL_NAME,
            description: 'Confirms that the selected model can call tools required by Tagvico.',
            parameters: {
              type: 'object',
              properties: { supported: { type: 'boolean' } },
              required: ['supported'],
              additionalProperties: false
            }
          }
        }],
        stream: false,
        options: { num_predict: 32 }
      }, {
        timeout: SETUP_VALIDATION_TIMEOUT_MS,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
      });
      return Boolean(response.data?.message?.tool_calls?.some(
        (tool: { function?: { name?: string; arguments?: unknown } }) =>
          tool.function?.name === SETUP_TOOL_NAME
          && hasSupportedSetupArguments(tool.function.arguments)
      ));
    } catch (error) {
      console.error('Ollama validation error:', errorMessage(error));
      return false;
    }
  }

  async validateAzureConfig(apiKey: string, endpoint: string, deploymentName: string, apiVersion: string) {
    console.log('Endpoint: ', endpoint);
    if (apiKey && endpoint && deploymentName && apiVersion) {
      try {
        const openai = new AzureOpenAI({
          apiKey,
          endpoint,
          deployment: deploymentName,
          apiVersion,
          timeout: SETUP_VALIDATION_TIMEOUT_MS
        });
        // Azure deployment names are operator-defined and need not reveal the
        // underlying reasoning-model family.
        let response;
        try {
          response = await openai.chat.completions.create(toolValidationRequest(
            deploymentName,
            { forceCompletionTokens: true }
          ));
        } catch (error) {
          if (!/max_completion_tokens|unsupported (?:parameter|argument)|unknown (?:parameter|argument)/i.test(errorMessage(error))) {
            throw error;
          }
          response = await openai.chat.completions.create(toolValidationRequest(
            deploymentName,
            { forceStandardTokens: true }
          ));
        }
        const now = new Date();
        const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
        return hasSetupToolCall(response);
      } catch (error) {
        console.error('OpenAI validation error:', errorMessage(error));
        return false;
      }
    }
    return false;
  }

  async validateConfig(config: SetupConfig): Promise<boolean> {
    config = this.effectiveConfig(config);
    // Validate Paperless config
    const paperlessApiUrl = config.PAPERLESS_API_URL.replace(/\/api/g, '');
    const paperlessValid = await this.validatePaperlessConfig(
      paperlessApiUrl,
      config.PAPERLESS_API_TOKEN
    );
    
    if (!paperlessValid) {
      throw new Error('Invalid Paperless configuration');
    }

    // Validate AI provider config
    const aiProvider = normalizeProvider(config.AI_PROVIDER || 'openrouter');

    console.log('AI provider:', aiProvider);
    
    if (aiProvider === 'openrouter') {
      const openRouterValid = await this.validateOpenRouterConfig(
        config.OPENROUTER_API_KEY || config.OPENAI_API_KEY,
        config.OPENROUTER_MODEL || config.AI_MODEL || 'openai/gpt-5.4-mini',
        config.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
      );
      if (!openRouterValid) {
        throw new Error('Invalid OpenRouter configuration');
      }
    } else if (aiProvider === 'openai') {
      const openaiValid = await this.validateOpenAIConfig(config.OPENAI_API_KEY, config.OPENAI_MODEL);
      if (!openaiValid) {
        throw new Error('Invalid OpenAI configuration');
      }
    } else if (aiProvider === 'ollama') {
      const ollamaValid = await this.validateOllamaConfig(
        config.OLLAMA_API_URL || 'http://localhost:11434',
        config.OLLAMA_MODEL,
        config.OLLAMA_API_KEY
      );
      if (!ollamaValid) {
        throw new Error('Invalid Ollama configuration');
      }
    } else if (aiProvider === 'ollama-cloud') {
      const ollamaCloudValid = await this.validateOllamaConfig(
        config.OLLAMA_CLOUD_API_URL || 'https://ollama.com',
        config.OLLAMA_CLOUD_MODEL,
        config.OLLAMA_CLOUD_API_KEY
      );
      if (!ollamaCloudValid) {
        throw new Error('Invalid Ollama Cloud configuration');
      }
    } else if (aiProvider === 'opencode') {
      const opencodeValid = await this.validateCustomConfig(
        config.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
        config.OPENCODE_API_KEY,
        config.OPENCODE_MODEL
      );
      if (!opencodeValid) {
        throw new Error('Invalid OpenCode Go configuration');
      }
    } else if (aiProvider === 'compatible' || aiProvider === 'custom') {
      const customValid = await this.validateCustomConfig(
        config.COMPATIBLE_BASE_URL || config.CUSTOM_BASE_URL,
        config.COMPATIBLE_API_KEY || config.CUSTOM_API_KEY,
        config.COMPATIBLE_MODEL || config.CUSTOM_MODEL
      );
      if (!customValid) {
        throw new Error('Invalid OpenAI-compatible AI configuration');
      }
    } else if (aiProvider === 'azure') {
      const azureValid = await this.validateAzureConfig(
        config.AZURE_API_KEY,
        config.AZURE_ENDPOINT,
        config.AZURE_DEPLOYMENT_NAME,
        config.AZURE_API_VERSION
      );
      if (!azureValid) {
        throw new Error('Invalid Azure configuration');
      }
    }


    return true;
  }

  async saveConfig(config: SetupConfig): Promise<void> {
    try {
      // Validate the new configuration before saving
      await this.validateConfig(config);
      await this.persistConfig(config);
    } catch (error) {
      console.error('Error saving config:', errorMessage(error));
      throw error;
    }
  }

  async saveValidatedConfig(config: SetupConfig): Promise<void> {
    await this.persistConfig(config);
  }

  async saveTagPolicy(policy: SetupConfig) {
    const current = (await this.loadConfig()) || {};
    const next = { ...current, ...policy };
    await this.persistConfig(next);
    return next;
  }

  async savePartialConfig(
    patch: SetupConfig,
    options: {
      validateCurrent?: (current: SetupConfig) => void | Promise<void>;
    } = {}
  ) {
    const operation = this.writeQueue.then(async () => {
      const current = (await this.loadConfig()) || {};
      await options.validateCurrent?.(current);
      await this.persistConfig({ ...current, ...patch });
    });
    this.writeQueue = operation.catch(() => {});
    await operation;
  }

  private serializeEnvironment(config: SetupConfig): string {
    return Object.entries(config)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, rawValue]) => {
        const value = String(rawValue ?? '');
        const safeUnquoted = /^[A-Za-z0-9_./:@,+*-]*$/.test(value);
        if (safeUnquoted) return `${key}=${value}`;
        // dotenv leaves backslash-escaped double quotes untouched, so
        // JSON.stringify is not a lossless .env serializer. Pick a delimiter
        // that does not occur in the value; this also prevents a multiline
        // value from closing its quote and injecting a second environment key.
        if (!value.includes('\'')) return `${key}='${value}'`;
        if (!value.includes('`')) return `${key}=\`${value}\``;
        if (!value.includes('"') && !/\\[nr]/.test(value)) return `${key}="${value}"`;
        throw new Error(`Cannot persist ${key}: value contains every supported dotenv quote delimiter`);
      })
      .join('\n') + '\n';
  }

  private async persistConfig(config: SetupConfig): Promise<void> {
    const dataDir = path.dirname(this.envPath);
    await fs.mkdir(dataDir, { recursive: true });
    const temporaryPath = path.join(dataDir, `.env.${process.pid}.${Date.now()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, this.serializeEnvironment(config), {
        encoding: 'utf8',
        mode: 0o600
      });
      await fs.rename(temporaryPath, this.envPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
    this.reloadRuntimeConfig();
    const setupMarker = config?.TAGVICO_AI_INITIAL_SETUP || config?.ARCHIVISTA_AI_INITIAL_SETUP;
    this.configured = Boolean(config.PAPERLESS_API_URL && setupMarker === 'yes');
  }

  reloadRuntimeConfig() {
    const persistedEnvironment = this.readPersistedEnvironment();
    if (persistedEnvironment) {
      for (const key of this.persistedEnvironmentKeys) {
        if (!this.injectedEnvironmentKeys.has(key)) delete process.env[key];
      }
      for (const [key, value] of Object.entries(persistedEnvironment)) {
        if (!this.injectedEnvironmentKeys.has(key)) process.env[key] = value;
      }
      this.persistedEnvironmentKeys = new Set(Object.keys(persistedEnvironment));
    }
    const injectedEnvironment = runtimeConfig.injectedEnvironment;
    const configPath = require.resolve('../config/config');
    delete require.cache[configPath];
    const freshConfig = require('../config/config');
    Object.keys(runtimeConfig).forEach((key) => delete runtimeConfig[key]);
    Object.assign(runtimeConfig, freshConfig);
    runtimeConfig.injectedEnvironment = injectedEnvironment;
    const cachedModule = require.cache[configPath];
    if (cachedModule) cachedModule.exports = runtimeConfig;
  }

  injectedEnvironmentValue(name: string): string | undefined {
    const value = String(process.env[name] || '').trim();
    return this.injectedEnvironmentKeys.has(name) && value ? value : undefined;
  }

  effectiveConfig(config: SetupConfig): SetupConfig {
    const effective = { ...config };
    for (const key of this.injectedEnvironmentKeys) {
      const value = this.injectedEnvironmentValue(key);
      if (value !== undefined) effective[key] = value;
    }
    return effective;
  }

  async isConfigured() {
    if (this.configured !== null) {
      return this.configured;
    }
    try {
      const config = await this.loadConfig();
      const setupMarker = config?.TAGVICO_AI_INITIAL_SETUP || config?.ARCHIVISTA_AI_INITIAL_SETUP;
      this.configured = Boolean(config?.PAPERLESS_API_URL && setupMarker === 'yes');
      if (!this.configured) {
        console.log('PAPERLESS_API_URL not set. Starting setup process...');
      }
      return this.configured;
    } catch (error) {
      console.error('Error checking initial configuration:', errorMessage(error));
      this.configured = false;
      return false;
    }
  }
}

const setupService = new SetupService();

export default setupService;
module.exports = setupService;
