const test = require('node:test');
const assert = require('node:assert/strict');

process.env.OLLAMA_API_KEY = 'local-runtime-key';
process.env.OLLAMA_CLOUD_API_KEY = '';

const catalog = require('../dist/services/providerCatalogService');
const helpers = require('../dist/services/configHelpers');
const runtimeConfig = require('../dist/config/config');

test('subscription and cloud providers normalize to first-class provider IDs', () => {
  assert.equal(catalog.normalizeProvider('opencode'), 'opencode');
  assert.equal(catalog.normalizeProvider('copilot'), 'copilot');
  assert.equal(catalog.normalizeProvider('ollama-cloud'), 'ollama-cloud');
  assert.equal(catalog.getDefaultModel('opencode'), 'deepseek-v4-flash');
  assert.equal(catalog.getDefaultModel('copilot'), 'gpt-5.4-mini');
});

test('OpenAI accepts custom model IDs without inventing an account catalog', () => {
  assert.equal(catalog.normalizeOpenAIModel('gpt-6-luna', {}), 'gpt-6-luna');
  assert.equal(catalog.normalizeOpenAIModel('organization-model-alias', {}), 'organization-model-alias');
  assert.equal('openaiDirectModels' in catalog.buildCatalog({ AI_PROVIDER: 'openai' }), false);
});

test('catalog effective model follows the selected provider-specific model', () => {
  const result = catalog.buildCatalog({
    AI_PROVIDER: 'codex',
    AI_MODEL: 'openai/gpt-5.4-mini',
    CODEX_MODEL: 'gpt-6-luna'
  });
  assert.equal(result.effectiveModel, 'gpt-6-luna');
});

test('provider payload keeps OpenCode, Copilot, and Ollama Cloud credentials separate', () => {
  const opencode = helpers.normalizeProviderPayload({
    aiProvider: 'opencode', opencodeApiKey: 'oc_sk_test', opencodeModel: 'opencode/model', opencodeBaseUrl: 'https://console.example/v1'
  });
  assert.deepEqual(opencode, {
    provider: 'opencode',
    selectedModel: 'opencode/model',
    openrouterApiKey: '',
    openrouterBaseUrl: '',
    ollamaUrl: 'http://localhost:11434',
    ollamaApiKey: '',
    ollamaCloudUrl: 'https://ollama.com',
    ollamaCloudApiKey: '',
    opencodeBaseUrl: 'https://console.example/v1',
    opencodeApiKey: 'oc_sk_test',
    copilotGitHubToken: '',
    compatibleBaseUrl: '',
    compatibleApiKey: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    azureEndpoint: '',
    azureApiKey: '',
    azureDeploymentName: '',
    azureApiVersion: ''
  });
  const ollama = helpers.normalizeProviderPayload({
    aiProvider: 'ollama',
    OLLAMA_API_KEY: 'local_ollama_key'
  });
  assert.equal(ollama.ollamaApiKey, 'local_ollama_key');
  assert.equal(ollama.ollamaCloudApiKey, '');
});

test('runtime keeps local and cloud Ollama credentials separate', () => {
  assert.equal(runtimeConfig.ollama.apiKey, 'local-runtime-key');
  assert.equal(runtimeConfig.ollamaCloud.apiKey, '');
});

test('provider payload preserves a custom OpenRouter base URL', () => {
  const openrouter = helpers.normalizeProviderPayload({
    aiProvider: 'openrouter',
    openrouterApiKey: 'or_test',
    openrouterBaseUrl: 'https://router.example/v1',
    openrouterModel: 'chat/model'
  });
  assert.equal(openrouter.openrouterBaseUrl, 'https://router.example/v1');
});

test('v3 setup preserves canonical provider model environment keys', () => {
  for (const [provider, key, model] of [
    ['ollama-cloud', 'OLLAMA_CLOUD_MODEL', 'cloud/account-model'],
    ['opencode', 'OPENCODE_MODEL', 'gateway/account-model'],
    ['copilot', 'COPILOT_MODEL', 'copilot-account-model'],
    ['codex', 'CODEX_MODEL', 'chatgpt-account-model']
  ]) {
    assert.equal(helpers.normalizeProviderPayload({
      AI_PROVIDER: provider,
      AI_MODEL: model,
      [key]: model
    }).selectedModel, model);
    assert.equal(helpers.normalizeProviderPayload({
      AI_PROVIDER: provider,
      [key]: model
    }).selectedModel, model);
  }
});
