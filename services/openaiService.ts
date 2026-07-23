const {
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile
} = require('./serviceUtils');
const OpenAI = require('openai');
const config = require('../config/config');
const fs = require('fs').promises;
const RestrictionPromptService = require('./restrictionPromptService');
const tagGroupService = require('./tagGroupService');
const { normalizeProvider } = require('./providerCatalogService');
const { loadThumbnail, buildUserMessage } = require('./thumbnailHelper');
const confidenceGuard = require('./confidenceGuard');
const customFieldsService = require('./customFieldsService');
const openaiBatchService = require('./openaiBatchService');
const { ProviderAdapter } = require('./providerAdapter');
type AnalysisOptions = { externalApiData?: unknown };
type CustomField = { value: string };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

class OpenAIService extends ProviderAdapter {
  constructor() {
    super();
    this.name = 'openai';
    this.displayName = 'OpenAI compatible';
    this.privacy = 'cloud';
    this.costTier = 'paid';
    this.client = null;
    this.clientKey = null;
  }

  async healthcheck() {
    const started = Date.now();
    try {
      this.initialize();
      if (!this.client) throw new Error('Provider credentials are not configured');
      await this.client.models.list();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) { return { ok: false, error: errorMessage(error), latencyMs: Date.now() - started }; }
  }

  modelMetadata() {
    return { id: config.aiModel || '', contextWindow: Number(config.tokenLimit || 0), supportsImages: true };
  }

  reset() {
    this.client = null;
    this.clientKey = null;
  }

  initialize() {
    const provider = normalizeProvider(config.aiProvider);

    if (provider === 'ollama' && (!this.client || this.clientKey !== `${provider}:${config.ollama.apiUrl}`)) {
      this.client = new OpenAI({
        baseURL: config.ollama.apiUrl + '/v1',
        apiKey: 'ollama'
      });
      this.clientKey = `${provider}:${config.ollama.apiUrl}`;
    } else if (provider === 'compatible' && (!this.client || this.clientKey !== `${provider}:${config.compatible.apiUrl}`)) {
      this.client = new OpenAI({
        baseURL: config.compatible.apiUrl,
        apiKey: config.compatible.apiKey || 'Tagvico AI-compatible'
      });
      this.clientKey = `${provider}:${config.compatible.apiUrl}`;
    } else if (provider === 'openrouter' && (!this.client || this.clientKey !== `${provider}:${config.openrouter.baseUrl}`)) {
      if (config.openrouter.apiKey) {
        this.client = new OpenAI({
          apiKey: config.openrouter.apiKey,
          baseURL: config.openrouter.baseUrl,
          defaultHeaders: {
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/arturict/tagvico-ai',
            'X-Title': 'Tagvico AI'
          }
        });
        this.clientKey = `${provider}:${config.openrouter.baseUrl}`;
      }
    } else if (provider === 'openai' && (!this.client || this.clientKey !== provider)) {
      if (config.openai.apiKey) {
        this.client = new OpenAI({
          apiKey: config.openai.apiKey
        });
        this.clientKey = provider;
      }
    }
  }

  async analyzeDocument(content: string, existingTags: string[] = [], existingCorrespondentList: string[] = [], existingDocumentTypesList: string[] = [], id: string, customPrompt: string | null = null, options: AnalysisOptions = {}) {
    try {
      this.initialize();
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      // Handle thumbnail caching
      const { thumbnailAvailable, thumbnailData } = await loadThumbnail(id);

      // Format existing tags
      let existingTagsList = existingTags.join(', ');

      // Get external API data if available and validate it
      let externalApiData = options.externalApiData ?? null;
      let validatedExternalApiData = null;

      if (externalApiData !== null && externalApiData !== undefined) {
        try {
          validatedExternalApiData = await this._validateAndTruncateExternalApiData(externalApiData);
          console.log('[DEBUG] External API data validated and included');
        } catch (error) {
          console.warn('[WARNING] External API data validation failed:', errorMessage(error));
          validatedExternalApiData = null;
        }
      }

      let systemPrompt = '';
      let systemPromptExtra = '';
      let promptTags = '';
      const provider = normalizeProvider(config.aiProvider);
      const model = provider === 'openrouter'
        ? config.openrouter.model
        : config.openai.model || process.env.OPENAI_MODEL;

      // Parse CUSTOM_FIELDS from environment variable
      let customFieldsObj;
      try {
        customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS || '{"custom_fields":[]}');
      } catch (error) {
        console.error('Failed to parse CUSTOM_FIELDS:', error);
        customFieldsObj = { custom_fields: [] };
      }

      // Generate custom fields template for the prompt
      const customFieldsTemplate: Record<number, { field_name: string; value: string }> = {};

      customFieldsObj.custom_fields.forEach((field: CustomField, index: number) => {
        customFieldsTemplate[index] = {
          field_name: field.value,
          value: "Fill in the value based on your analysis"
        };
      });

      // Convert template to string for replacement and wrap in custom_fields
      const customFieldsStr = '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
        .split('\n')
        .map(line => '    ' + line)  // Add proper indentation
        .join('\n');

      // Discover live custom fields from Paperless and append a JSON
      // description block. Falls back to the static env-var list when
      // the discovery call fails (e.g. unauthenticated or offline).
      let liveFieldList = [];
      try {
        liveFieldList = await customFieldsService.listFields();
      } catch (error) {
        console.warn('[WARN] Custom field discovery failed:', errorMessage(error));
      }
      if (liveFieldList.length > 0) {
        const liveBlock = customFieldsService.formatForPrompt(liveFieldList);
        systemPromptExtra = `\n\nKnown custom fields (from Paperless, with type info):\n${liveBlock}\n\nUse these field names exactly when populating custom_fields. Drop fields whose declared type does not match the value.`;
      }

      // Get system prompt and model
      if (config.useExistingData === 'yes' && config.restrictToExistingTags === 'no' && config.restrictToExistingCorrespondents === 'no') {
        systemPrompt = `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` + process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        promptTags = '';
      } else {
        config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        systemPrompt = process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt;
        promptTags = '';
      }

      // Process placeholder replacements in system prompt
      systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
        systemPrompt,
        existingTags,
        existingCorrespondentList,
        config
      );

      // Include validated external API data if available
      if (validatedExternalApiData) {
        systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
      }

      if (process.env.USE_PROMPT_TAGS === 'yes') {
        promptTags = process.env.PROMPT_TAGS || '';
        systemPrompt = `
        Take these tags and try to match one or more to the document content.\n\n
        ` + config.specialPromptPreDefinedTags;
      }

      if (customPrompt) {
        console.log('[DEBUG] Replace system prompt with custom prompt via WebHook');
        systemPrompt = customPrompt + '\n\n' + config.mustHavePrompt;
      }
      if (tagGroupService.promptContract() && !systemPrompt.includes('CONTROLLED TAGGING:')) systemPrompt += `\n\n${tagGroupService.promptContract()}`;

      // Append the confidence-scoring contract so the model returns per-field
      // scores that the guardrails module can compare against the threshold.
      systemPrompt = confidenceGuard.appendConfidencePrompt(systemPrompt);

      // Append the discovered custom field list, if any.
      if (systemPromptExtra) {
        systemPrompt += systemPromptExtra;
      }

      // Calculate tokens AFTER all prompt modifications are complete
      const totalPromptTokens = await calculateTotalPromptTokens(
        systemPrompt,
        process.env.USE_PROMPT_TAGS === 'yes' ? [promptTags] : [],
        model
      );

      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens);
      const availableTokens = maxTokens - reservedTokens;

      // Validate that we have positive available tokens
      if (availableTokens <= 0) {
        console.warn(`[WARNING] No available tokens for content. Reserved: ${reservedTokens}, Max: ${maxTokens}`);
        throw new Error('Token limit exceeded: prompt too large for available token limit');
      }

      console.log(`[DEBUG] Token calculation - Prompt: ${totalPromptTokens}, Reserved: ${reservedTokens}, Available: ${availableTokens}`);
      console.log(`[DEBUG] Use existing data: ${config.useExistingData}, Restrictions applied based on useExistingData setting`);
      console.log(`[DEBUG] External API data: ${validatedExternalApiData ? 'included' : 'none'}`);

      const truncatedContent = await truncateToTokenLimit(content, availableTokens, model);

      await writePromptToFile(systemPrompt, truncatedContent);

      const userMessage = {
        role: 'user',
        content: buildUserMessage(truncatedContent, thumbnailAvailable ? thumbnailData : null)
      };

      const responsePayload: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          userMessage
        ]
      };

      if (!/^gpt-5/i.test(model) && !/^o[134]/i.test(model)) {
        responsePayload.temperature = 0.3;
      }

      if ((process.env.AI_REASONING_EFFORT || 'auto') !== 'auto') {
        responsePayload.reasoning_effort = process.env.AI_REASONING_EFFORT || 'low';
      }

      if (provider === 'openai' && config.processingMode === 'flex') {
        responsePayload.service_tier = 'flex';
      }

      const response = provider === 'openai' && config.processingMode === 'batch'
        ? await openaiBatchService.enqueue(this.client, responsePayload)
        : await this.client.chat.completions.create(
          responsePayload,
          config.processingMode === 'flex' ? { timeout: 15 * 60 * 1000 } : undefined
        );

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let jsonContent = response.choices[0].message.content;
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(jsonContent);
        //write to file and append to the file (txt)
        fs.appendFile('./logs/response.txt', jsonContent, (err: NodeJS.ErrnoException | null) => {
          if (err) throw err;
        });
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        // Hold the whole document for review when parsing fails entirely.
        parsedResponse = { tags: [], correspondent: null, held_for_review: ['title', 'tags', 'correspondent', 'document_type', 'custom_fields', 'owner'] };
        return {
          document: parsedResponse,
          metrics: mappedUsage,
          truncated: truncatedContent.length < content.length
        };
      }

      if (!parsedResponse || !Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
        throw new Error('Invalid response structure: missing tags array or correspondent string');
      }

      // Annotate the response with the held_for_review fields based on
      // per-field confidence. Field values are never logged.
      parsedResponse = confidenceGuard.annotateHeldFields(parsedResponse);

      return {
        document: parsedResponse,
        metrics: mappedUsage,
        truncated: truncatedContent.length < content.length
      };
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return {
        document: { tags: [], correspondent: null },
        metrics: null,
        error: errorMessage(error)
      };
    }
  }

  /**
   * Validate and truncate external API data to prevent token overflow
   * @param {any} apiData - The external API data to validate
   * @param {number} maxTokens - Maximum tokens allowed for external data (default: 500)
   * @returns {string} - Validated and potentially truncated data string
   */
  async _validateAndTruncateExternalApiData(apiData: unknown, maxTokens = 500) {
    if (apiData === null || apiData === undefined) {
      return null;
    }

    const dataString = typeof apiData === 'object'
      ? JSON.stringify(apiData, null, 2)
      : String(apiData);

    // Calculate tokens for the data
    const dataTokens = await calculateTokens(dataString, process.env.OPENAI_MODEL);

    if (dataTokens > maxTokens) {
      console.warn(`[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`);
      return await truncateToTokenLimit(dataString, maxTokens, process.env.OPENAI_MODEL);
    }

    console.log(`[DEBUG] External API data validated: ${dataTokens} tokens`);
    return dataString;
  }

  async analyzePlayground(content: string, prompt: string) {
    const musthavePrompt = `
    Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:  
        {
          "title": "xxxxx",
          "correspondent": "xxxxxxxx",
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
          "document_date": "YYYY-MM-DD",
          "language": "en/de/es/..."
        }`;

    try {
      this.initialize();
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      // Calculate total prompt tokens including musthavePrompt
      const totalPromptTokens = await calculateTotalPromptTokens(
        prompt + musthavePrompt // Combined system prompt
      );

      // Calculate available tokens
      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens); // Reserve for response
      const availableTokens = maxTokens - reservedTokens;

      // Truncate content if necessary
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);
      const model = process.env.OPENAI_MODEL || config.openai.model || '';
      // Make API request
      const responsePayload: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'system',
            content: prompt + musthavePrompt
          },
          {
            role: 'user',
            content: truncatedContent
          }
        ]
      };

      if (!/^gpt-5/i.test(model) && !/^o[134]/i.test(model)) {
        responsePayload.temperature = 0.3;
      }

      if ((process.env.AI_REASONING_EFFORT || 'auto') !== 'auto') {
        responsePayload.reasoning_effort = process.env.AI_REASONING_EFFORT || 'low';
      }

      const response = await this.client.chat.completions.create(responsePayload);

      // Handle response
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      // Log token usage
      console.log(`[DEBUG] [${timestamp}] OpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const usage = response.usage;
      const mappedUsage = {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      };

      let jsonContent = response.choices[0].message.content;
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(jsonContent);
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from API');
      }

      // Validate response structure
      if (!parsedResponse || !Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
        throw new Error('Invalid response structure: missing tags array or correspondent string');
      }

      return {
        document: parsedResponse,
        metrics: mappedUsage,
        truncated: truncatedContent.length < content.length
      };
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return {
        document: { tags: [], correspondent: null },
        metrics: null,
        error: errorMessage(error)
      };
    }
  }

  /**
   * Generate text based on a prompt
   * @param {string} prompt - The prompt to generate text from
   * @returns {Promise<string>} - The generated text
   */
  async generateText(prompt: string) {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      const model = process.env.OPENAI_MODEL || config.openai.model;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with OpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    // send test request to OpenAI API and respond with 'ok' or 'error'
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
          {
            role: "user",
            content: "Test"
          }
        ],
        temperature: 0.7
      });
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }
      return { status: 'ok', model: process.env.OPENAI_MODEL };
    } catch (error) {
      console.error('Error checking OpenAI status:', error);
      return { status: 'error', error: errorMessage(error) };
    }
  }
}

module.exports = new OpenAIService();
