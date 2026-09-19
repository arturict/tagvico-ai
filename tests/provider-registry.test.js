const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../dist/services/providerRegistry');
const discovery = require('../dist/services/providerDiscoveryService');
const codexAuth = require('../dist/services/codexAuthService');
const copilot = require('../dist/services/copilotService');

test('provider definitions are unique and own their schemas and runtime adapters', () => {
  const definitions = registry.getProviderDefinitions();
  assert.deepEqual(definitions.map((definition) => definition.id), [
    'openrouter',
    'ollama',
    'ollama-cloud',
    'opencode',
    'copilot',
    'compatible',
    'openai',
    'codex',
    'typesafe'
  ]);
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, definitions.length);
  for (const definition of definitions) {
    assert.ok(definition.configurationSchema);
    assert.ok(definition.runtimeAdapter);
    assert.ok(definition.modelEnvironmentKey);
  }
  assert.equal(registry.getProviderDefinition('anthropic'), null);
  assert.equal(registry.getProviderDefinition('azure'), null);
});

test('key-based providers expose write-only credentials and branded providers use local SVGL artwork', () => {
  const definitions = registry.getProviderDefinitions();
  for (const id of ['openrouter', 'ollama', 'ollama-cloud', 'opencode', 'copilot', 'compatible', 'openai']) {
    const definition = definitions.find((candidate) => candidate.id === id);
    assert.ok(definition.fields.some((field) => field.secret), `${id} must expose a secret field`);
  }
  for (const id of ['openrouter', 'ollama', 'ollama-cloud', 'opencode', 'copilot', 'openai', 'codex']) {
    const definition = definitions.find((candidate) => candidate.id === id);
    assert.match(definition.icon.path, /^\/provider-icons\/.+\.svg$/);
    assert.match(definition.icon.source, /^https:\/\/svgl\.app\/library\//);
  }
  assert.equal(definitions.find((candidate) => candidate.id === 'compatible').icon, null);
});

test('standard provider endpoints are safe prefilled defaults instead of required blank fields', () => {
  const definitions = registry.getProviderDefinitions();
  const defaults = Object.fromEntries(definitions.map((definition) => [
    definition.id,
    definition.fields.find((field) => field.key === 'baseUrl')?.defaultValue
      || definition.fields.find((field) => field.key === 'url')?.defaultValue
      || null
  ]));
  assert.equal(defaults.openrouter, 'https://openrouter.ai/api/v1');
  assert.equal(defaults.ollama, 'http://localhost:11434');
  assert.equal(defaults['ollama-cloud'], 'https://ollama.com');
  assert.equal(defaults.opencode, 'https://opencode.ai/zen/go/v1');
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

test('model discovery bounds response bytes and normalized catalog entries', async () => {
  assert.equal(registry.normalizeModels(
    Array.from({ length: 600 }, (_, index) => ({
      id: `model-${index}`,
      name: `Model ${index}`,
      isDefault: false,
      options: []
    }))
  ).length, 500);

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{}', {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(1024 * 1024 + 1)
    }
  });
  try {
    await assert.rejects(
      () => registry.discoverOpenAIModels(
        registry.getProviderDefinition('compatible'),
        { COMPATIBLE_BASE_URL: 'http://provider.test/v1' }
      ),
      /response exceeds the 1048576-byte limit/
    );
  } finally {
    global.fetch = originalFetch;
  }

  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    await assert.rejects(
      () => registry.discoverOpenAIModels(
        registry.getProviderDefinition('compatible'),
        { COMPATIBLE_BASE_URL: 'http://provider.test/v1' }
      ),
      /response exceeds the 1048576-byte limit/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('empty secret values retain the configured secret and provider fields map centrally', () => {
  assert.deepEqual(registry.providerValuesToEnvironment('compatible', {
    baseUrl: 'http://127.0.0.1:8317/v1',
    apiKey: ''
  }), {
    COMPATIBLE_BASE_URL: 'http://127.0.0.1:8317/v1'
  });
});

test('all eight provider discovery adapters normalize a live catalog', async () => {
  const originalFetch = global.fetch;
  const originalCodexModels = codexAuth.models;
  const originalCopilotStatus = copilot.status;
  global.fetch = async (url) => new Response(
    String(url).endsWith('/api/tags')
      ? JSON.stringify({ models: [{ name: 'local-model' }] })
      : String(url).endsWith('/api/show')
        ? JSON.stringify({
            capabilities: ['completion', 'tools'],
            model_info: { 'local.context_length': 32768 }
          })
        : JSON.stringify({ data: [{ id: 'live-model', name: 'Live model' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
  codexAuth.models = async () => [{
    id: 'gpt-5.6-terra',
    name: 'Terra',
    isDefault: true,
    reasoningEfforts: [{ id: 'high', description: 'Deliberate' }]
  }];
  copilot.status = async () => ({
    ok: true,
    authenticated: true,
    models: [{ id: 'copilot-model', name: 'Copilot model', reasoningEfforts: ['low'] }]
  });
  try {
    const env = {
      OPENROUTER_BASE_URL: 'http://provider.test/v1',
      OPENROUTER_API_KEY: 'test',
      OLLAMA_API_URL: 'http://provider.test',
      OLLAMA_CLOUD_API_URL: 'http://provider.test',
      OLLAMA_CLOUD_API_KEY: 'test',
      OPENCODE_BASE_URL: 'http://provider.test/v1',
      OPENCODE_API_KEY: 'test',
      COMPATIBLE_BASE_URL: 'http://provider.test/v1',
      OPENAI_API_KEY: 'test'
    };
    for (const id of registry.getProviderDefinitions().map((provider) => provider.id)) {
      const models = await discovery.discoverProviderModels(id, env);
      assert.ok(models.length > 0, `${id} should return at least one normalized model`);
      assert.ok(models[0].id, `${id} should return a model ID`);
    }
  } finally {
    global.fetch = originalFetch;
    codexAuth.models = originalCodexModels;
    copilot.status = originalCopilotStatus;
  }
});

test('Ollama discovery reads live capabilities without inventing them when show fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/api/tags')) {
      return new Response(JSON.stringify({
        models: [{ name: 'gemma4:e2b' }, { name: 'legacy-local:latest' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const requested = JSON.parse(String(init?.body || '{}')).model;
    if (requested === 'legacy-local:latest') {
      return new Response('not supported', { status: 404 });
    }
    return new Response(JSON.stringify({
      capabilities: ['completion', 'tools', 'vision', 'thinking'],
      model_info: { 'gemma4.context_length': 131072 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const models = await registry.discoverOllamaModels(
      registry.getProviderDefinition('ollama'),
      { OLLAMA_API_URL: 'http://provider.test' }
    );
    assert.deepEqual(models, [
      {
        id: 'gemma4:e2b',
        name: 'gemma4:e2b',
        isDefault: false,
        options: [],
        capabilities: ['completion', 'tools', 'vision', 'thinking'],
        contextWindow: 131072
      },
      {
        id: 'legacy-local:latest',
        name: 'legacy-local:latest',
        isDefault: false,
        options: [],
        capabilities: []
      }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Ollama discovery shares one deadline across catalog detail requests', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'services', 'providerRegistry.ts'),
    'utf8'
  );
  assert.match(source, /const discoverySignal = AbortSignal\.timeout\(10_000\)/);
  assert.match(source, /fetchJson\(`\$\{baseUrl\}\/api\/tags`, authHeaders, \{ signal: discoverySignal \}\)/);
  assert.match(source, /body: JSON\.stringify\(\{ model: model\.id, verbose: false \}\),\s*signal: discoverySignal/);
});
