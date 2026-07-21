import { promises as fs } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { AzureOpenAI, OpenAI } from 'openai';
import { resolveDataDirectory } from './dataDirectory';
const runtimeConfig = require('../config/config');
const { normalizeProvider } = require('./providerCatalogService');

type SetupConfig = Record<string, string>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tokenLimitParam(model: string, value: number) {
  return /^gpt-5/i.test(model || '')
    ? { max_completion_tokens: value }
    : { max_tokens: value };
}

class SetupService {
  private readonly envPath: string;
  private configured: boolean | null;

  constructor() {
    this.envPath = path.join(resolveDataDirectory(), '.env');
    this.configured = null; // Variable to store the configuration status
  }

  async loadConfig(): Promise<SetupConfig | null> {
    try {
      const envContent = await fs.readFile(this.envPath, 'utf8');
      const config: SetupConfig = {};
      envContent.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
          config[key.trim()] = value.trim();
        }
      });
      return config;
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
        headers: {
          'Authorization': `Token ${token}`
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
    for (const endpoint of ['correspondents', 'tags', 'documents', 'document_types', 'custom_fields', 'users']) {
      try {
        console.log(`Validating API permissions for ${baseUrl}/api/${endpoint}/`);
        const response = await axios.get(`${baseUrl}/api/${endpoint}/`, {
          headers: {
            'Authorization': `Token ${token}`
          }
        });
        console.log(`API permissions validated for ${endpoint}, ${response.status}`);
        if (response.status !== 200) {
          console.error(`API permissions validation failed for ${endpoint}`);
          return { success: false, message: `API permissions validation failed for endpoint '/api/${endpoint}/'` };
        }
      } catch (error) {
        console.error(`API permissions validation failed for ${endpoint}:`, errorMessage(error));
        return { success: false, message: `API permissions validation failed for endpoint '/api/${endpoint}/'` };
      }
    }
    return { success: true, message: 'API permissions validated successfully' };
}


  async validateOpenAIConfig(apiKey?: string): Promise<boolean> {
    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const model = process.env.OPENAI_MODEL || 'gpt-5.4-nano';
        const response = await openai.chat.completions.create({
          model,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          ...tokenLimitParam(model, 8)
        });
        const now = new Date();
        const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
        return response.choices && response.choices.length > 0;
      } catch (error) {
        console.error('OpenAI validation error:', errorMessage(error));
        return false;
      }
    }
    return false;
  }

  async validateOpenRouterConfig(apiKey?: string, model = 'openai/gpt-5.4-nano'): Promise<boolean> {
    if (!apiKey) {
      return false;
    }

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/arturict/tagvico-ai',
          'X-Title': 'Tagvico AI'
        }
      });

      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        ...tokenLimitParam(model, 8)
      });

      return !!response?.choices?.length;
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
      });
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: "Test" }],
        model: config.model,
      });
      return completion.choices && completion.choices.length > 0;
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
      const response = await axios.post(`${url}/api/generate`, {
        model: model || 'llama3.2',
        prompt: 'Test',
        stream: false
      }, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
      });
      return response.data && response.data.response;
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
          apiVersion
        });
        const response = await openai.chat.completions.create({
          model: deploymentName,
          messages: [{ role: "user", content: "Test" }],
        });
        const now = new Date();
        const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
        return response.choices && response.choices.length > 0;
      } catch (error) {
        console.error('OpenAI validation error:', errorMessage(error));
        return false;
      }
    }
    return false;
  }

  async validateConfig(config: SetupConfig): Promise<boolean> {
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
        config.OPENROUTER_MODEL || config.AI_MODEL || 'openai/gpt-5.4-mini'
      );
      if (!openRouterValid) {
        throw new Error('Invalid OpenRouter configuration');
      }
    } else if (aiProvider === 'openai') {
      const openaiValid = await this.validateOpenAIConfig(config.OPENAI_API_KEY);
      if (!openaiValid) {
        throw new Error('Invalid OpenAI configuration');
      }
    } else if (aiProvider === 'ollama') {
      const ollamaValid = await this.validateOllamaConfig(
        config.OLLAMA_API_URL || 'http://localhost:11434',
        config.OLLAMA_MODEL
      );
      if (!ollamaValid) {
        throw new Error('Invalid Ollama configuration');
      }
    } else if (aiProvider === 'ollama-cloud') {
      const ollamaCloudValid = await this.validateOllamaConfig(
        config.OLLAMA_CLOUD_API_URL || 'https://ollama.com',
        config.OLLAMA_CLOUD_MODEL,
        config.OLLAMA_CLOUD_API_KEY || config.OLLAMA_API_KEY
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

      const JSON_STANDARD_PROMPT = `
        Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
        
        {
          "title": "xxxxx",
          "correspondent": "xxxxxxxx",
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
          "document_date": "YYYY-MM-DD",
          "language": "en/de/es/..."
        }`;

      // Ensure data directory exists
      const dataDir = path.dirname(this.envPath);
      await fs.mkdir(dataDir, { recursive: true });

      const envContent = Object.entries(config)
        .map(([key, value]) => {
          if (key === "SYSTEM_PROMPT") {
            return `${key}=\`${value}\n\``;
          }
          return `${key}=${value}`;
        })
        .join('\n');

      await fs.writeFile(this.envPath, envContent);
      
      // Reload environment variables
      Object.entries(config).forEach(([key, value]) => {
        process.env[key] = String(value);
      });
      this.reloadRuntimeConfig();
      this.configured = true;
    } catch (error) {
      console.error('Error saving config:', errorMessage(error));
      throw error;
    }
  }

  async saveTagPolicy(policy: SetupConfig) {
    const current = (await this.loadConfig()) || {};
    const next = { ...current, ...policy };
    const envContent = Object.entries(next).map(([key, value]) => `${key}=${value}`).join('\n');
    await fs.writeFile(this.envPath, envContent);
    Object.entries(policy).forEach(([key, value]) => { process.env[key] = String(value); });
    this.reloadRuntimeConfig();
    return next;
  }

  reloadRuntimeConfig() {
    const configPath = require.resolve('../config/config');
    delete require.cache[configPath];
    const freshConfig = require('../config/config');
    Object.keys(runtimeConfig).forEach((key) => delete runtimeConfig[key]);
    Object.assign(runtimeConfig, freshConfig);
    const cachedModule = require.cache[configPath];
    if (cachedModule) cachedModule.exports = runtimeConfig;
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

module.exports = new SetupService();
