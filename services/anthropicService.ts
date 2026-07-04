// @ts-nocheck — legacy module; tracked for strict typing.
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const confidenceGuard = require('./confidenceGuard');
const { ProviderAdapter } = require('./providerAdapter');

class AnthropicService extends ProviderAdapter {
  constructor() {
    super();
    this.name = 'anthropic';
    this.displayName = 'Anthropic Claude';
    this.client = null;
    this.key = null;
    this.pending = [];
    this.timer = null;
  }

  async healthcheck() {
    const started = Date.now();
    try {
      this.initialize();
      if (!this.client) throw new Error('Anthropic API key is not configured');
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) { return { ok: false, error: error.message, latencyMs: Date.now() - started }; }
  }

  modelMetadata() { return { id: config.anthropic.model, contextWindow: 200000, supportsImages: true }; }

  initialize() {
    if (config.anthropic?.apiKey && this.key !== config.anthropic.apiKey) {
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
      this.key = config.anthropic.apiKey;
    }
  }

  reset() { this.client = null; this.key = null; }

  buildRequest(content, existingTags, correspondents, documentTypes) {
    const context = `Existing tags: ${existingTags.join(', ')}\nExisting correspondents: ${correspondents.join(', ')}\nExisting document types: ${documentTypes.join(', ')}`;
    return {
      model: config.anthropic.model,
      max_tokens: Number(config.responseTokens || 1000),
      system: confidenceGuard.appendConfidencePrompt(`${process.env.SYSTEM_PROMPT || ''}\n${context}\n${config.mustHavePrompt}`),
      messages: [{ role: 'user', content }]
    };
  }

  async analyzeDocument(content, existingTags = [], correspondents = [], documentTypes = []) {
    try {
      this.initialize();
      if (!this.client) throw new Error('Anthropic client not initialized');
      const request = this.buildRequest(content, existingTags, correspondents, documentTypes);
      const response = config.processingMode === 'batch'
        ? await this.enqueueBatch(request)
        : await this.client.messages.create(request);
      const text = response.content?.find((block) => block.type === 'text')?.text || '';
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
      return { document: { tags: [], correspondent: null }, metrics: null, error: error.message };
    }
  }

  enqueueBatch(params) {
    return new Promise((resolve, reject) => {
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
        requests: items.map((item) => ({ custom_id: item.customId, params: item.params }))
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
      items.forEach((item) => item.reject(error));
    }
  }
}

module.exports = new AnthropicService();
