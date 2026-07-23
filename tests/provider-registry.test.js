const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../dist/services/providerRegistry');

test('provider definitions are unique and own their schemas and runtime adapters', () => {
  const definitions = registry.getProviderDefinitions();
  assert.ok(definitions.length >= 10);
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, definitions.length);
  for (const definition of definitions) {
    assert.ok(definition.configurationSchema);
    assert.ok(definition.runtimeAdapter);
    assert.ok(definition.modelEnvironmentKey);
  }
});

test('unknown provider instances are preserved as unavailable instead of silently masquerading as a known provider', () => {
  assert.equal(registry.getProviderDefinition('future-private-runtime'), null);
});

test('model normalization maps runtime reasoning efforts to model-scoped options', () => {
  const options = registry.normalizeReasoningOptions([
    { id: 'low', description: 'Fast' },
    { id: 'high', description: 'More deliberate' }
  ], 'low');
  assert.deepEqual(options, [{
    id: 'reasoningEffort',
    label: 'Thinking effort',
    description: 'Options reported by this model at runtime.',
    type: 'select',
    defaultValue: 'low',
    values: [
      { id: 'low', label: 'low', description: 'Fast' },
      { id: 'high', label: 'high', description: 'More deliberate' }
    ]
  }]);
});

test('normalization keeps runtime ordering, defaults and unique model IDs', () => {
  assert.deepEqual(registry.normalizeModels([
    { id: 'gpt-5.6-luna', name: 'Luna', isDefault: true, options: [] },
    { id: 'gpt-5.6-terra', name: 'Terra', isDefault: false, options: [] },
    { id: 'gpt-5.6-luna', name: 'Duplicate', isDefault: false, options: [] }
  ]).map((model) => [model.id, model.isDefault]), [
    ['gpt-5.6-luna', true],
    ['gpt-5.6-terra', false]
  ]);
});

test('empty secret values retain the configured secret and provider fields map centrally', () => {
  assert.deepEqual(registry.providerValuesToEnvironment('compatible', {
    baseUrl: 'http://127.0.0.1:8317/v1',
    apiKey: ''
  }), {
    COMPATIBLE_BASE_URL: 'http://127.0.0.1:8317/v1'
  });
});
