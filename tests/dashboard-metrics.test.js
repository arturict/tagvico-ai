const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardSummary, num, sumBy } = require('../dist/services/dashboardMetrics');
const { estimateCost, resolvePrice, normalizeModelId } = require('../dist/services/modelPricing');

test('dashboard metrics safely handle empty and malformed values', () => {
  assert.equal(num('12'), 12);
  assert.equal(num('invalid'), 0);
  assert.equal(sumBy([{ count: 1 }, { count: 2 }, { count: 'x' }], 'count'), 3);
  const summary = buildDashboardSummary({}, {});
  assert.equal(summary.counts.remaining, 0);
  assert.equal(summary.counts.processedPct, 0);
  assert.equal(summary.tokens.promptPct, 0);
  assert.deepEqual(summary.topDocumentTypes, []);
});

test('dashboard metrics derive totals, percentages, ordering, and hourly counts', () => {
  const summary = buildDashboardSummary({
    documentCount: 1000, processedDocumentCount: 250, tagCount: 7, correspondentCount: 3,
    documentTypes: [{ type: 'Receipt', count: 5 }, { type: 'Invoice', count: 10 }, { type: '', count: 2 }],
    processingTimeStats: [{ hour: '08', count: 4 }, { hour: '09', count: 6 }]
  }, { averagePromptTokens: 800, averageCompletionTokens: 200, averageTotalTokens: 1000, tokensOverall: 250000, metricCount: 250 });
  assert.deepEqual(summary.counts, { documents: 1000, processed: 250, remaining: 750, processedPct: 25, tags: 7, correspondents: 3 });
  assert.equal(summary.tokens.promptTotal, 200000);
  assert.equal(summary.tokens.completionTotal, 50000);
  assert.equal(summary.tokens.promptPct, 80);
  assert.equal(summary.today.total, 10);
  assert.equal(summary.topDocumentTypes[0].type, 'Invoice');
});

test('model pricing resolves known models with longest match and provider-prefixed ids', () => {
  assert.equal(normalizeModelId('openai/gpt-4o-mini'), 'gpt-4o-mini');
  assert.equal(resolvePrice('gpt-4o-mini').label, 'GPT-4o mini');
  assert.equal(resolvePrice('gpt-4o-mini').source, 'known');
  // longest match wins: gpt-4o-mini must not resolve to gpt-4o
  assert.equal(resolvePrice('openai/gpt-4o-2024-08-06').label, 'GPT-4o');
  // unknown cloud model falls back but stays flagged as an estimate
  assert.equal(resolvePrice('some-unknown-model').source, 'fallback');
  // local models are free
  assert.equal(resolvePrice('llama3.1', 'ollama').source, 'local');
  assert.equal(resolvePrice('llama-3.1-8b', 'compatible').input, 0);
});

test('cost estimate multiplies token totals by per-1M rates and derives per-document cost', () => {
  // gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output
  const cost = estimateCost({ promptTotal: 2_000_000, completionTotal: 1_000_000, metricCount: 100, model: 'gpt-4o-mini', provider: 'openai' });
  assert.equal(cost.available, true);
  assert.equal(cost.isEstimate, false);
  assert.equal(Math.round(cost.inputCost * 100) / 100, 0.3); // 2M * 0.15/1M
  assert.equal(Math.round(cost.outputCost * 100) / 100, 0.6); // 1M * 0.60/1M
  assert.equal(Math.round(cost.total * 100) / 100, 0.9);
  assert.equal(Math.round(cost.perDocument * 1000) / 1000, 0.009);
});

test('cost estimate anchors against a manual-filing equivalent and derives savings', () => {
  const cost = estimateCost({ promptTotal: 2_000_000, completionTotal: 1_000_000, metricCount: 100, model: 'gpt-4o-mini', provider: 'openai' });
  // 100 documents * $1.00 manual equivalent
  assert.equal(cost.manualEquivalent, 100);
  // savings = manual - AI total (0.9), never negative
  assert.equal(Math.round(cost.savings * 100) / 100, 99.1);
});

test('gpt-5.4-mini resolves to its known price and is the default OpenAI-family estimate', () => {
  const price = resolvePrice('gpt-5.4-mini', 'openai');
  assert.equal(price.label, 'GPT-5.4 mini');
  assert.equal(price.source, 'known');
  assert.equal(price.input, 0.75);
  assert.equal(price.output, 4.5);
  // must not collapse into the shorter "gpt-5" entry
  assert.notEqual(resolvePrice('openai/gpt-5.4-mini').label, 'GPT-5');
});

test('cost estimate is unavailable for free local models and when no tokens exist', () => {
  const local = estimateCost({ promptTotal: 1_000_000, completionTotal: 1_000_000, metricCount: 5, model: 'llama3.1', provider: 'ollama' });
  assert.equal(local.available, false);
  assert.equal(local.total, 0);
  const empty = estimateCost({ promptTotal: 0, completionTotal: 0, metricCount: 0, model: 'gpt-4o', provider: 'openai' });
  assert.equal(empty.available, false);
});

test('dashboard summary embeds a cost estimate derived from token totals and model', () => {
  const summary = buildDashboardSummary(
    {},
    { averagePromptTokens: 800, averageCompletionTokens: 200, averageTotalTokens: 1000, tokensOverall: 1000000, metricCount: 1000, model: 'gpt-4o-mini', provider: 'openai' }
  );
  assert.equal(summary.cost.available, true);
  assert.equal(summary.cost.model, 'GPT-4o mini');
  assert.ok(summary.cost.total > 0);
  assert.ok(summary.cost.perDocument > 0);
});
