const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../dist/services/providerCatalogService');
const helpers = require('../dist/services/configHelpers');

test('subscription and cloud providers normalize to first-class provider IDs', () => {
  assert.equal(catalog.normalizeProvider('opencode'), 'opencode');
  assert.equal(catalog.normalizeProvider('copilot'), 'copilot');
  assert.equal(catalog.normalizeProvider('ollama-cloud'), 'ollama-cloud');
  assert.equal(catalog.getDefaultModel('copilot'), 'gpt-5.4');
});

test('GPT-5.6 preview models stay gated unless the organization explicitly enables them', () => {
  assert.equal(catalog.normalizeOpenAIModel('gpt-5.6-luna', {}), 'gpt-5.4-mini');
  assert.equal(
    catalog.normalizeOpenAIModel('gpt-5.6-luna', { OPENAI_ENABLE_GPT_5_6_PREVIEW: 'yes' }),
    'gpt-5.6-luna'
  );
  assert.equal(catalog.buildCatalog({ AI_PROVIDER: 'openai' }).openaiPreviewAvailable, false);
  assert.equal(
    catalog.buildCatalog({ AI_PROVIDER: 'openai', OPENAI_ENABLE_GPT_5_6_PREVIEW: 'yes' }).openaiPreviewAvailable,
    true
  );
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
