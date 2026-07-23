const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../dist/services/providerCatalogService');
const helpers = require('../dist/services/configHelpers');

test('subscription and cloud providers normalize to first-class provider IDs', () => {
  assert.equal(catalog.normalizeProvider('opencode'), 'opencode');
  assert.equal(catalog.normalizeProvider('copilot'), 'copilot');
  assert.equal(catalog.normalizeProvider('ollama-cloud'), 'ollama-cloud');
  assert.equal(catalog.getDefaultModel('opencode'), 'deepseek-v4-flash');
  assert.equal(catalog.getDefaultModel('copilot'), 'gpt-5.4-mini');
});

test('OpenAI accepts custom model IDs without inventing an account catalog', () => {
  assert.equal(catalog.normalizeOpenAIModel('gpt-5.6-luna', {}), 'gpt-5.6-luna');
  assert.equal(catalog.normalizeOpenAIModel('organization-model-alias', {}), 'organization-model-alias');
  assert.equal('openaiDirectModels' in catalog.buildCatalog({ AI_PROVIDER: 'openai' }), false);
});

test('catalog effective model follows the selected provider-specific model', () => {
  const result = catalog.buildCatalog({
    AI_PROVIDER: 'codex',
    AI_MODEL: 'openai/gpt-5.4-mini',
    CODEX_MODEL: 'gpt-5.6-luna'
  });
  assert.equal(result.effectiveModel, 'gpt-5.6-luna');
});

test('provider payload keeps OpenCode, Copilot, and Ollama Cloud credentials separate', () => {
  const opencode = helpers.normalizeProviderPayload({
    aiProvider: 'opencode', opencodeApiKey: 'oc_sk_test', opencodeModel: 'opencode/model', opencodeBaseUrl: 'https://console.example/v1'
  });
  assert.deepEqual(opencode, {
    provider: 'opencode',
    selectedModel: 'opencode/model',
    openrouterApiKey: '',
    ollamaUrl: 'http://localhost:11434',
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
});
