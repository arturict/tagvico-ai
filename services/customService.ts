const {
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile
} = require('./serviceUtils');
const OpenAI = require('openai');
const config = require('../config/config');
const tiktoken = require('tiktoken');
const fs = require('fs').promises;
const RestrictionPromptService = require('./restrictionPromptService');
const tagGroupService = require('./tagGroupService');
const { normalizeProvider } = require('./providerCatalogService');
const { loadThumbnail, buildUserMessage } = require('./thumbnailHelper');
const confidenceGuard = require('./confidenceGuard');
const promptPolicyService = require('./promptPolicyService');
type AnalysisOptions = { externalApiData?: unknown };
type CustomField = { value: string };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const nativeImport = new Function('specifier', 'return import(specifier)');

class CustomOpenAIService {
  client: InstanceType<typeof OpenAI> | null;
  tokenizer: unknown;
  clientKey: string | null;
  model: string;
  constructor() {
    this.client = null;
    this.tokenizer = null;
    this.clientKey = null;
    this.model = '';
  }

  reset() {
    this.client = null;
    this.clientKey = null;
    this.model = '';
  }

  initialize() {
    const provider = normalizeProvider(config.aiProvider);
    const providerConfig = provider === 'opencode'
      ? config.opencode
      : (config.compatible.apiUrl || config.custom.apiUrl ? {
          apiUrl: config.compatible.apiUrl || config.custom.apiUrl,
          apiKey: config.compatible.apiKey || config.custom.apiKey,
          model: config.compatible.model || config.custom.model
        } : null);
    const apiUrl = providerConfig?.apiUrl;
    const apiKey = providerConfig?.apiKey;

    if (['compatible', 'custom', 'opencode'].includes(provider) && apiUrl && (!this.client || this.clientKey !== `${provider}:${apiUrl}:${apiKey || ''}`)) {
      this.client = new OpenAI({
        baseURL: apiUrl,
        apiKey: apiKey || 'Tagvico AI-compatible'
      });
      this.clientKey = `${provider}:${apiUrl}:${apiKey || ''}`;
    }
    this.model = providerConfig?.model || '';
  }

  async createCompletion(payload: Record<string, any>) {
    const [{ generateText }, { createOpenAICompatible }] = await Promise.all([
      nativeImport('ai'),
      nativeImport('@ai-sdk/openai-compatible')
    ]);
    const provider = normalizeProvider(config.aiProvider);
    const providerConfig = provider === 'opencode' ? config.opencode : config.compatible;
    const compatible = createOpenAICompatible({
      name: 'tagvicoCompatible',
      baseURL: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey || 'Tagvico AI-compatible',
      includeUsage: true
    });
    const messages = (payload.messages || []).filter((message: Record<string, unknown>) => message.role !== 'system').map((message: Record<string, any>) => ({
      role: message.role,
      content: Array.isArray(message.content) ? message.content.map((part: Record<string, any>) => part.type === 'image_url'
        ? { type: 'image', image: part.image_url.url }
        : part) : message.content
    }));
    const system = (payload.messages || []).find((message: Record<string, unknown>) => message.role === 'system')?.content;
    const effort = String(process.env.AI_REASONING_EFFORT || 'auto');
    const result = await generateText({
      model: compatible.chatModel(payload.model),
      ...(system ? { system } : {}),
      messages,
      ...(payload.max_tokens ? { maxOutputTokens: payload.max_tokens } : {}),
      ...(effort !== 'auto' ? { providerOptions: { tagvicoCompatible: { reasoningEffort: effort } } } : {})
    });
    const usage = result.usage || {};
    return {
      choices: [{ message: { content: result.text } }],
      usage: {
        prompt_tokens: usage.inputTokens || 0,
        completion_tokens: usage.outputTokens || 0,
        total_tokens: usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0)
      }
    };
  }

  async analyzeDocument(content: string, existingTags: string[] = [], existingCorrespondentList: string[] = [], existingDocumentTypesList: string[] = [], id: string, customPrompt: string | null = null, options: AnalysisOptions = {}) {
    try {
      this.initialize();
      const now = new Date();
      const timestamp = now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

      if (!this.client) {
        throw new Error('Custom OpenAI client not initialized');
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
      let promptTags = '';
      const configuredPrompt = promptPolicyService.configuredPrompt(customPrompt);
      const model = this.model;
      if (!model) throw new Error('Choose an OpenAI-compatible model before processing documents');

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
      const requiredPrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);

      // Get system prompt based on configuration
      if (config.useExistingData === 'yes' && config.restrictToExistingTags === 'no' && config.restrictToExistingCorrespondents === 'no') {
        systemPrompt = `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` + configuredPrompt + '\n\n' + requiredPrompt;
        promptTags = '';
      } else {
        systemPrompt = configuredPrompt + '\n\n' + requiredPrompt;
        promptTags = '';
      }

      // Process placeholder replacements in system prompt
      systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
        systemPrompt,
        existingTags,
        existingCorrespondentList,
        existingDocumentTypesList,
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
        ` + configuredPrompt + '\n\n' + config.specialPromptPreDefinedTags;
      }

      if (tagGroupService.promptContract() && !systemPrompt.includes('CONTROLLED TAGGING:')) systemPrompt += `\n\n${tagGroupService.promptContract()}`;

      // Append the confidence-scoring contract so the model returns per-field
      // scores that the guardrails module can compare against the threshold.
      systemPrompt = confidenceGuard.appendConfidencePrompt(systemPrompt);

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

      // console.log('######################################################################');
      // console.log(`[DEBUG] Content length: ${content.length}, Truncated content length: ${truncatedContent.length}`);
      // console.log(`[DEBUG] Truncated content: ${truncatedContent}`);
      // console.log(`[DEBUG] System prompt: ${systemPrompt}`);
      // console.log(`[DEBUG] Prompt tags: ${promptTags}`);
      // console.log(`[DEBUG] Model: ${model}`);
      // console.log(`[DEBUG] Custom fields: ${customFieldsStr}`);
      // console.log(`[DEBUG] Existing tags: ${existingTagsList}`);
      // console.log(`[DEBUG] Existing correspondents: ${existingCorrespondentList}`);
      // console.log(`[DEBUG] Custom prompt: ${customPrompt}`);
      // console.log(`[DEBUG] External API data: ${validatedExternalApiData}`);
      // console.log('######################################################################');


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
        ],
        temperature: 0.3
      };

      const response = await this.createCompletion(responsePayload);

      // Handle response
      //console.log(`MESSAGE: ${response?.choices?.[0]?.message?.content}`);
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      // Log token usage
      console.log(`[DEBUG] [${timestamp}] Custom OpenAI request sent`);
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

      // Validate response structure
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
      const dataTokens = await calculateTokens(dataString, this.model);

    if (dataTokens > maxTokens) {
      console.warn(`[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`);
      return await truncateToTokenLimit(dataString, maxTokens, this.model);
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
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      // Calculate total prompt tokens including musthavePrompt
      const totalPromptTokens = await calculateTotalPromptTokens(
        prompt + musthavePrompt // Combined system prompt
      );

      // Calculate available tokens
      const maxTokens = Number(config.tokenLimit);
      const reservedTokens = totalPromptTokens + Number(config.responseTokens);
      const availableTokens = maxTokens - reservedTokens;

      // Truncate content if necessary
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);

      // Make API request
      const response = await this.createCompletion({
        model: this.model,
        messages: [
          {
            role: "system",
            content: prompt + musthavePrompt
          },
          {
            role: "user",
            content: truncatedContent
          }
        ],
        temperature: 0.3,
      });

      // Handle response
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      // Log token usage
      console.log(`[DEBUG] [${timestamp}] Custom OpenAI request sent`);
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
        // Hold the whole document for review when parsing fails entirely.
        parsedResponse = { tags: [], correspondent: null, held_for_review: ['title', 'tags', 'correspondent', 'document_type', 'custom_fields', 'owner'] };
        return {
          document: parsedResponse,
          metrics: mappedUsage,
          truncated: truncatedContent.length < content.length
        };
      }

      // Validate response structure
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
   * Generate text based on a prompt
   * @param {string} prompt - The prompt to generate text from
   * @returns {Promise<string>} - The generated text
   */
  async generateText(prompt: string) {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      const model = this.model;

      const response = await this.createCompletion({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 128000
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with Custom OpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      const model = this.model;

      const response = await this.createCompletion({
        model: model,
        messages: [
          {
            role: "user",
            content: 'Ping'
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      if (!response?.choices?.[0]?.message?.content) {
        return { status: 'error' };
      }

      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error generating text with Custom OpenAI:', error);
      return { status: 'error' };
    }
  }
}

module.exports = new CustomOpenAIService();
