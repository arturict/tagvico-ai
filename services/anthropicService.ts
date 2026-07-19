const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const confidenceGuard = require('./confidenceGuard');
const tagGroupService = require('./tagGroupService');
const { ProviderAdapter } = require('./providerAdapter');
type BatchItem = { params: unknown; resolve: (value: unknown) => void; reject: (reason?: unknown) => void; customId: string };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

class AnthropicService extends ProviderAdapter {
  pending: BatchItem[];
  timer: NodeJS.Timeout | null;
  constructor() {
    super();
    this.name = 'anthropic';
    this.displayName = 'Anthropic Claude';
    this.client = null;
    this.key = null;
    this.pending = [] as BatchItem[];
    this.timer = null;
  }

  async healthcheck() {
    const started = Date.now();
    try {
      this.initialize();
      if (!this.client) throw new Error('Anthropic API key is not configured');
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) { return { ok: false, error: errorMessage(error), latencyMs: Date.now() - started }; }
  }

  modelMetadata() { return { id: config.anthropic.model, contextWindow: 200000, supportsImages: true }; }

  initialize() {
    if (config.anthropic?.apiKey && this.key !== config.anthropic.apiKey) {
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
      this.key = config.anthropic.apiKey;
    }
  }

  reset() { this.client = null; this.key = null; }

  buildRequest(content: string, existingTags: string[], correspondents: string[], documentTypes: string[]) {
    const context = `Existing tags: ${existingTags.join(', ')}\nExisting correspondents: ${correspondents.join(', ')}\nExisting document types: ${documentTypes.join(', ')}`;
    return {
      model: config.anthropic.model,
      max_tokens: Number(config.responseTokens || 1000),
      system: confidenceGuard.appendConfidencePrompt(`${process.env.SYSTEM_PROMPT || ''}\n${context}\n${config.mustHavePrompt}\n${tagGroupService.promptContract()}`),
      messages: [{ role: 'user', content }]
    };
  }

  async analyzeDocument(content: string, existingTags: string[] = [], correspondents: string[] = [], documentTypes: string[] = []) {
    try {
      this.initialize();
      if (!this.client) throw new Error('Anthropic client not initialized');
      const request = this.buildRequest(content, existingTags, correspondents, documentTypes);
      const response = config.processingMode === 'batch'
        ? await this.enqueueBatch(request)
        : await this.client.messages.create(request);
      const text = response.content?.find((block: { type: string; text?: string }) => block.type === 'text')?.text || '';
      const document = confidenceGuard.annotateHeldFields(JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()));
      const usage = response.usage || {};
      return {
        document,
        metrics: {
          promptTokens: usage.input_tokens || 0,
          completionTokens: usage.output_tokens || 0,
          totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
        },
        truncated: false
      };
    } catch (error) {
      return { document: { tags: [], correspondent: null }, metrics: null, error: errorMessage(error) };
    }
  }

  async generateText(prompt: string) {
    this.initialize();
    if (!this.client) throw new Error('Anthropic client not initialized');
    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: Math.max(300, Number(config.responseTokens || 1000)),
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.content?.find((block: { type: string; text?: string }) => block.type === 'text')?.text;
    if (!text) throw new Error('Anthropic returned no text');
    return text;
  }

  enqueueBatch(params: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      this.pending.push({ params, resolve, reject, customId: `doc-${Date.now()}-${this.pending.length}` });
      if (!this.timer) this.timer = setTimeout(() => this.flushBatch(), 100);
    });
  }

  async flushBatch() {
    const items = this.pending.splice(0);
    this.timer = null;
    if (!items.length) return;
    try {
      let batch = await this.client.messages.batches.create({
        requests: items.map((item: BatchItem) => ({ custom_id: item.customId, params: item.params }))
      });
      const pollMs = Math.max(1000, Number(process.env.BATCH_POLL_INTERVAL_MS || 30000));
      while (batch.processing_status === 'in_progress') {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        batch = await this.client.messages.batches.retrieve(batch.id);
      }
      const results = new Map();
      for await (const result of await this.client.messages.batches.results(batch.id)) {
        results.set(result.custom_id, result.result);
      }
      for (const item of items) {
        const result = results.get(item.customId);
        if (result?.type === 'succeeded') item.resolve(result.message);
        else item.reject(new Error(result?.error?.message || `Anthropic batch failed for ${item.customId}`));
      }
    } catch (error) {
      items.forEach((item: BatchItem) => item.reject(error));
    }
  }
}

module.exports = new AnthropicService();
