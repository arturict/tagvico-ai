import { buildFilingPlan, mapAnswersToDocument } from './typesafeFiling';
import type { Answer, Question } from './typesafeFiling';

const config = require('../config/config');
const confidenceGuard = require('./confidenceGuard');
const tagGroupService = require('./tagGroupService');

type AnalysisOptions = { externalApiData?: unknown };
type Connection = { apiUrl: string; apiKey: string; model: string };
type SystemOneResponse = {
  answers?: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

const REQUEST_TIMEOUT_MS = 30_000;
const HEALTH_CACHE_MS = 10 * 60_000;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

class TypeSafeService {
  lastHealthyAt = 0;
  lastHealthyKey = '';

  reset() {
    this.lastHealthyAt = 0;
    this.lastHealthyKey = '';
  }

  settings() {
    const typesafe = config.typesafe || {};
    return {
      apiUrl: String(typesafe.apiUrl || 'https://api.typesafe.ai/v1').replace(/\/+$/, ''),
      apiKey: String(typesafe.apiKey || ''),
      model: String(typesafe.model || 'jev-latest'),
      tagThreshold: Number(typesafe.tagThreshold) > 0 && Number(typesafe.tagThreshold) <= 1 ? Number(typesafe.tagThreshold) : 0.6
    };
  }

  async ask(state: string, questions: Record<string, Question>, overrides: Partial<Connection> = {}): Promise<SystemOneResponse> {
    const { apiUrl, apiKey, model } = { ...this.settings(), ...overrides };
    if (!apiKey) throw new Error('TypeSafe API key is not configured');
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${apiUrl}/systemone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model, questions }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.ok) return await response.json() as SystemOneResponse;
      if ((response.status === 429 || response.status === 529) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      const hint = (await response.text().catch(() => '')).slice(0, 200);
      throw new Error(`TypeSafe API returned HTTP ${response.status}${hint ? `: ${hint}` : ''}`);
    }
  }

  // Jev has no system prompt, so the custom prompt and external API data do not
  // apply. Custom fields and the owner are never suggested and stay for review.
  async analyzeDocument(content: string, existingTags: string[] = [], existingCorrespondentList: string[] = [], existingDocumentTypesList: string[] = [], id: string, customPrompt: string | null = null, options: AnalysisOptions = {}) {
    try {
      const plan = buildFilingPlan(content, existingTags, existingCorrespondentList, existingDocumentTypesList);
      const state = plan.state;
      if (plan.trimmed.length) console.warn(`[WARNING] TypeSafe request for document ${id} exceeded the request budget; shortened: ${plan.trimmed.join(', ')}`);
      const response = await this.ask(state, plan.questions);
      if (!response.answers) throw new Error('Invalid API response structure');

      const policy = tagGroupService.getConfig();
      const document = mapAnswersToDocument(plan, state, response.answers, {
        tagThreshold: this.settings().tagThreshold,
        maxTags: policy.enabled ? policy.maximum : 10
      });
      const inputTokens = Number(response.usage?.input_tokens || 0);
      const outputTokens = Number(response.usage?.output_tokens || 0);
      console.log(`[DEBUG] TypeSafe request for document ${id}: ${Object.keys(plan.questions).length} questions, ${inputTokens} input tokens`);

      return {
        document: confidenceGuard.annotateHeldFields(document),
        metrics: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
        truncated: state.length < String(content || '').length
      };
    } catch (error) {
      console.error('Failed to analyze document:', errorMessage(error));
      return { document: { tags: [], correspondent: null }, metrics: null, error: errorMessage(error) };
    }
  }

  async analyzePlayground(content: string) {
    return this.analyzeDocument(content, [], [], [], 'playground');
  }

  async generateText(): Promise<string> {
    throw new Error('TypeSafe Jev is a decision model and cannot generate text. Configure a text model for the Companion and chat features.');
  }

  async probe(overrides: Partial<Connection> = {}) {
    await this.ask('ping', { ok: { type: 'noul', instructions: 'The text is a greeting.' } }, overrides);
  }

  /** Setup wizard check: one minimal request with the values being entered. */
  async validate(apiKey: string, model: string, baseUrl?: string): Promise<boolean> {
    try {
      await this.probe({ apiKey, model, ...(baseUrl ? { apiUrl: baseUrl.replace(/\/+$/, '') } : {}) });
      return true;
    } catch (error) {
      console.error('TypeSafe validation failed:', errorMessage(error));
      return false;
    }
  }

  // Every probe is a billed request, so a recent success is reused.
  async healthcheck() {
    const started = Date.now();
    const { apiKey, apiUrl } = this.settings();
    try {
      const key = `${apiUrl}:${apiKey}`;
      if (this.lastHealthyKey !== key || started - this.lastHealthyAt > HEALTH_CACHE_MS) {
        await this.probe();
        this.lastHealthyAt = Date.now();
        this.lastHealthyKey = key;
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, error: errorMessage(error), latencyMs: Date.now() - started };
    }
  }

  async checkStatus() {
    try {
      await this.probe();
      return { status: 'ok', model: this.settings().model };
    } catch (error) {
      return { status: 'error', error: errorMessage(error) };
    }
  }

  modelMetadata() {
    return { id: this.settings().model, contextWindow: 64_000, supportsImages: false };
  }
}

module.exports = new TypeSafeService();
