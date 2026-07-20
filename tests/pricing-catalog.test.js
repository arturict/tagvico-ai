const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveDataDirectory } = require('../dist/services/dataDirectory');

const cachePath = path.join(resolveDataDirectory(), 'model-pricing-cache.json');

// Seed a deterministic offline cache BEFORE requiring the module so the first
// synchronous lookup reads it (and no network call is required for the test).
const fixture = {
  fetchedAt: Date.now(),
  source: 'test-fixture',
  models: {
    'gpt-5.4-mini': { input: 0.75, output: 4.5, label: 'GPT-5.4 mini (live)' },
    'grok-4': { input: 3, output: 15, label: 'Grok 4' },
    'deepseek-chat': { input: 0.14, output: 0.28, label: 'DeepSeek Chat' }
  }
};
fs.mkdirSync(path.dirname(cachePath), { recursive: true });
fs.writeFileSync(cachePath, JSON.stringify(fixture), 'utf8');

const catalog = require('../dist/services/pricingCatalog');
const { resolvePrice } = require('../dist/services/modelPricing');

test('pricing catalog serves live prices from the on-disk cache (offline path)', () => {
  assert.deepEqual(catalog.lookupPrice('grok-4'), { input: 3, output: 15, label: 'Grok 4' });
  assert.deepEqual(catalog.lookupPrice('x-ai/grok-4'), { input: 3, output: 15, label: 'Grok 4' });
  const dated = catalog.lookupPrice('deepseek/deepseek-chat-2026-01-01');
  assert.equal(dated.input, 0.14);
  assert.equal(catalog.lookupPrice('totally-unknown-model'), null);
});

test('resolvePrice prefers the live catalog and flags it as non-estimate', () => {
  const grok = resolvePrice('x-ai/grok-4');
  assert.equal(grok.source, 'live');
  assert.equal(grok.input, 3);
  const known = resolvePrice('gpt-4o-mini', 'openai');
  assert.equal(known.source, 'known');
  const fallback = resolvePrice('some-brand-new-model', 'openrouter');
  assert.equal(fallback.source, 'fallback');
  assert.equal(resolvePrice('llama3.1', 'ollama').source, 'local');
});

test.after(() => {
  try { fs.unlinkSync(cachePath); } catch { /* ignore */ }
});

test('catalog labels from the cache never contain raw HTML markup', () => {
  // Labels surface on the dashboard inside a raw HTML string; a sanitized
  // catalog must not carry angle brackets/quotes through to lookups.
  for (const key of ['gpt-5.4-mini', 'grok-4', 'deepseek-chat']) {
    const entry = catalog.lookupPrice(key);
    assert.ok(entry, `expected a catalog entry for ${key}`);
    assert.doesNotMatch(entry.label, /[<>"'`]/);
  }
});
