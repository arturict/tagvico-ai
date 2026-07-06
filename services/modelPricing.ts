'use strict';

/**
 * Best-effort token pricing for the models Tagvico AI commonly talks to.
 *
 * Prices are USD per 1,000,000 tokens, split into input (prompt) and output
 * (completion) rates because output tokens are typically several times more
 * expensive than input tokens. Values are intentionally conservative,
 * human-maintained snapshots of public list prices and are only used to render
 * a clearly-labelled cost ESTIMATE on the dashboard - they are never billed
 * against and never fetched at runtime.
 *
 * Matching is done on a normalised model id with a longest-prefix strategy so
 * that dated or provider-prefixed variants (e.g. "openai/gpt-4o-2024-08-06")
 * still resolve to the right family. Local models (Ollama) resolve to a $0
 * entry so self-hosted setups correctly show no spend.
 */

interface ModelPrice {
  /** USD per 1,000,000 input/prompt tokens. */
  input: number;
  /** USD per 1,000,000 output/completion tokens. */
  output: number;
}

interface PricebookEntry extends ModelPrice {
  /** Substring/prefix matched against the normalised model id. */
  match: string;
  label: string;
}

// USD per 1M tokens (input / output). Snapshot of public list prices.
const PRICEBOOK: PricebookEntry[] = [
  { match: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', input: 1, output: 6 },
  { match: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', input: 2.5, output: 15 },
  { match: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', input: 5, output: 30 },
  { match: 'gpt-5.5-pro', label: 'GPT-5.5 Pro', input: 30, output: 120 },
  { match: 'gpt-5.5', label: 'GPT-5.5', input: 2.5, output: 15 },
  { match: 'gpt-5.4-nano', label: 'GPT-5.4 nano', input: 0.2, output: 1.25 },
  { match: 'gpt-5.4-mini', label: 'GPT-5.4 mini', input: 0.75, output: 4.5 },
  { match: 'gpt-5.4', label: 'GPT-5.4', input: 2.5, output: 15 },
  { match: 'gpt-4o-mini', label: 'GPT-4o mini', input: 0.15, output: 0.6 },
  { match: 'gpt-4o', label: 'GPT-4o', input: 2.5, output: 10 },
  { match: 'gpt-4.1-mini', label: 'GPT-4.1 mini', input: 0.4, output: 1.6 },
  { match: 'gpt-4.1-nano', label: 'GPT-4.1 nano', input: 0.1, output: 0.4 },
  { match: 'gpt-4.1', label: 'GPT-4.1', input: 3, output: 12 },
  { match: 'gpt-5-nano', label: 'GPT-5 nano', input: 0.05, output: 0.4 },
  { match: 'gpt-5-mini', label: 'GPT-5 mini', input: 0.25, output: 2 },
  { match: 'gpt-5', label: 'GPT-5', input: 1.25, output: 10 },
  { match: 'o4-mini', label: 'o4-mini', input: 1.1, output: 4.4 },
  { match: 'o3-mini', label: 'o3-mini', input: 1.1, output: 4.4 },
  { match: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku', input: 0.8, output: 4 },
  { match: 'claude-3-haiku', label: 'Claude 3 Haiku', input: 0.25, output: 1.25 },
  { match: 'claude-haiku', label: 'Claude Haiku', input: 0.8, output: 4 },
  { match: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', input: 3, output: 15 },
  { match: 'claude-sonnet', label: 'Claude Sonnet', input: 3, output: 15 },
  { match: 'claude-opus', label: 'Claude Opus', input: 15, output: 75 },
  { match: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', input: 0.1, output: 0.4 },
  { match: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', input: 0.075, output: 0.3 },
  { match: 'gemini-flash-lite', label: 'Gemini Flash Lite', input: 0.1, output: 0.4 },
  { match: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', input: 0.3, output: 2.5 },
  { match: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', input: 0.1, output: 0.4 },
  { match: 'gemini-flash', label: 'Gemini Flash', input: 0.3, output: 2.5 },
  { match: 'gemini-pro', label: 'Gemini Pro', input: 1.25, output: 10 }
];

// Sensible fallback when the exact model is unknown but a cloud provider is in
// use: assume an affordable "mini/flash" class model so estimates stay in the
// right order of magnitude rather than defaulting to an expensive flagship.
const FALLBACK_PRICE: ModelPrice = { input: 0.3, output: 1.2 };

type PriceSource = 'known' | 'local' | 'fallback';

interface ResolvedPrice {
  input: number;
  output: number;
  label: string;
  source: PriceSource;
}

function normalizeModelId(model: unknown): string {
  return String(model ?? '')
    .toLowerCase()
    .trim()
    // strip a leading provider namespace, e.g. "openai/gpt-4o" -> "gpt-4o"
    .replace(/^[a-z0-9.-]+\//, '')
    // drop a ":free"/":nitro" style suffix used by some routers
    .replace(/:[a-z0-9-]+$/, '');
}

function isLocalModel(provider: unknown, normalizedModel: string): boolean {
  const p = String(provider ?? '').toLowerCase();
  if (p === 'ollama') return true;
  if (p === 'openai' || p === 'anthropic' || p === 'azure') return false;
  // Common local/self-hosted model families that cost nothing to run.
  return /(^|[-])(llama|mistral|mixtral|phi|deepseek-r1)([-]|$)/.test(normalizedModel);
}

/**
 * Resolve the input/output price (USD per 1M tokens) for a model id.
 */
function resolvePrice(model: unknown, provider?: unknown): ResolvedPrice {
  const normalized = normalizeModelId(model);

  if (isLocalModel(provider, normalized)) {
    return { input: 0, output: 0, label: 'Local model', source: 'local' };
  }

  if (normalized) {
    // Longest match wins so "gpt-4o-mini" beats "gpt-4o".
    const matches = PRICEBOOK
      .filter((entry) => normalized.includes(entry.match))
      .sort((a, b) => b.match.length - a.match.length);
    if (matches[0]) {
      return { input: matches[0].input, output: matches[0].output, label: matches[0].label, source: 'known' };
    }
  }

  // Unknown cloud model: estimate with a conservative low-cost profile.
  return { input: FALLBACK_PRICE.input, output: FALLBACK_PRICE.output, label: 'Estimated rate', source: 'fallback' };
}

interface CostInput {
  promptTotal?: unknown;
  completionTotal?: unknown;
  metricCount?: unknown;
  model?: unknown;
  provider?: unknown;
}

interface CostSummary {
  available: boolean;
  isEstimate: boolean;
  source: PriceSource | 'none';
  model: string;
  currency: 'USD';
  rate: { input: number; output: number };
  inputCost: number;
  outputCost: number;
  total: number;
  perDocument: number;
  // Contrast anchor: what the same filing would plausibly cost if done by hand.
  manualEquivalent: number;
  savings: number;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Estimate spend from aggregate prompt/completion token totals.
 * All monetary values are USD. `available` is false when there is nothing
 * meaningful to show (no tokens tracked yet, or a free local model).
 */
function estimateCost(data: CostInput = {}): CostSummary {
  const promptTotal = toNumber(data.promptTotal);
  const completionTotal = toNumber(data.completionTotal);
  const metricCount = toNumber(data.metricCount);
  const resolved = resolvePrice(data.model, data.provider);

  const inputCost = (promptTotal / 1_000_000) * resolved.input;
  const outputCost = (completionTotal / 1_000_000) * resolved.output;
  const total = inputCost + outputCost;
  const perDocument = metricCount > 0 ? total / metricCount : 0;

  // Nothing worth surfacing: no tokens, or a genuinely free local model.
  const available = promptTotal + completionTotal > 0 && total > 0;

  // Contrast/anchor value: manually sorting, tagging and filing a document is
  // conservatively ~2 minutes of attention. At a modest $30/h that is $1.00 per
  // document. Anchoring the AI cost against this makes the true spend legible.
  const MANUAL_COST_PER_DOCUMENT = 1;
  const manualEquivalent = metricCount * MANUAL_COST_PER_DOCUMENT;
  const savings = Math.max(manualEquivalent - total, 0);

  return {
    available,
    isEstimate: resolved.source !== 'known',
    source: available ? resolved.source : 'none',
    model: resolved.label,
    currency: 'USD',
    rate: { input: resolved.input, output: resolved.output },
    inputCost,
    outputCost,
    total,
    perDocument,
    manualEquivalent,
    savings
  };
}

module.exports = { estimateCost, resolvePrice, normalizeModelId, PRICEBOOK };
