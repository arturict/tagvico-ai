// @ts-nocheck — migrated from JavaScript; types will be tightened incrementally.
/**
 * ProviderAdapter — the uniform shape every AI provider must implement.
 *
 * The existing concrete services (openaiService, customService, azureService,
 * ollamaService) will be migrated to this interface in a follow-up commit. This
 * file intentionally only declares the contract: a base class with no-op
 * defaults and a one-paragraph JSDoc that captures the migration plan.
 *
 * The contract guarantees four things:
 *  1. The adapter can be identified (`name`, `displayName`) so the UI can
 *     render provider-specific options without hard-coding provider strings.
 *  2. Privacy and cost metadata (`privacy`, `costTier`) are first-class
 *     properties so trust-tier UI (e.g. "on-device" vs "cloud") can be wired
 *     without re-asking the user.
 *  3. `healthcheck()` returns a structured `{ ok, error }` result so the
 *     onboarding flow can probe each provider consistently.
 *  4. `analyzeDocument(content, ctx)` is the single entry point that produces
 *     a normalised analysis object (with confidence fields once the
 *     guardrails commit lands), and `modelMetadata()` describes the model
 *     backing the adapter (context window, image support, etc.).
 *
 * Existing services will gradually migrate to this shape; do not delete or
 * rename the methods above without updating every concrete service.
 */
class ProviderAdapter {
  name = '';            // 'openai' | 'anthropic' | 'codex' | 'openrouter' | 'ollama' | 'compatible' | 'azure'
  displayName = '';
  privacy = 'cloud';    // 'cloud' | 'self-hosted' | 'on-device'
  costTier = 'paid';    // 'free' | 'paid' | 'subscription'

  /**
   * Probe the provider and return a health summary.
   * @returns {Promise<{ok: boolean, error?: string, latencyMs?: number}>}
   */
  async healthcheck() { return { ok: false, error: 'not implemented' }; }

  /**
   * Run the AI analysis pipeline for a single document.
   * @param {string} content - Extracted document text.
   * @param {object} ctx - Provider context (tags, correspondents, types, options).
   * @returns {Promise<object>} Normalised analysis result.
   */
  async analyzeDocument(content, ctx) { throw new Error('not implemented'); }

  /**
   * Static metadata about the model backing this adapter.
   * @returns {{id: string, contextWindow: number, supportsImages: boolean}}
   */
  modelMetadata() { return { id: '', contextWindow: 0, supportsImages: false }; }
}

module.exports = { ProviderAdapter };
