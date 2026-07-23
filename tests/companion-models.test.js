const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const companion = require('../dist/contracts/companion');
const modelService = require('../dist/services/companionModelService');

const providers = [
  {
    instanceId: 'codex',
    name: 'ChatGPT subscription',
    models: [
      { id: 'gpt-5.6-luna', name: 'Luna', isDefault: true, options: [] },
      { id: 'gpt-5.6-terra', name: 'Terra', isDefault: false, options: [] }
    ]
  },
  {
    instanceId: 'compatible',
    name: 'Compatible',
    models: [
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', isDefault: false, options: [] }
    ]
  }
];

test('Companion defaults to the active tagging selection when the verified catalog contains it', () => {
  assert.deepEqual(modelService.pickCompanionDefault(providers, {
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-terra'
  }), {
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-terra'
  });
});

test('Companion rejects stale or invented models and falls back to a runtime default', () => {
  const catalog = {
    providers,
    defaultSelection: { providerInstanceId: 'codex', modelId: 'gpt-5.6-luna' }
  };
  assert.equal(modelService.selectionIsAvailable(catalog, {
    providerInstanceId: 'codex',
    modelId: 'made-up-model'
  }), false);
  assert.deepEqual(modelService.pickCompanionDefault(providers, {
    providerInstanceId: 'codex',
    modelId: 'made-up-model'
  }), {
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-luna'
  });
});

test('manual-only provider definitions are never exposed as verified Companion runtimes', () => {
  assert.equal(modelService.supportsCompanionRuntime({
    runtimeAdapter: 'native-azure',
    discovery: 'manual'
  }), false);
  assert.equal(modelService.supportsCompanionRuntime({
    runtimeAdapter: 'codex-runtime',
    discovery: 'codex'
  }), true);
  const registry = require('../dist/services/providerRegistry');
  assert.equal(modelService.hasCompanionConfiguration(
    registry.getProviderDefinition('openai'),
    {}
  ), false);
  assert.equal(modelService.hasCompanionConfiguration(
    registry.getProviderDefinition('openai'),
    { OPENAI_API_KEY: 'configured' }
  ), true);
});

test('tag unification reuses the verified Companion catalog instead of advertising unverified account providers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'tagUnificationInference.ts'), 'utf8');
  assert.match(source, /companionModelService\.getCompanionModelCatalog\(\)/);
  assert.doesNotMatch(source, /configuredProviders[\s\S]*definition\.fields[\s\S]*field\.required/);
});

test('tool presentation strips model queries, OCR, proposal payloads and provider errors', () => {
  assert.deepEqual(companion.safeCompanionToolInput('search_documents', {
    query: 'private tax return 2026'
  }), { scope: 'Paperless documents' });
  assert.deepEqual(companion.safeCompanionToolInput('propose_action', {
    title: 'Secret cancellation',
    summary: 'private content'
  }), {});
  const output = companion.safeCompanionToolOutput(
    'search_documents',
    { query: 'secret' },
    [{ id: 1, title: 'Private title', content: 'OCR secret' }]
  );
  assert.deepEqual(output, { summary: 'Found 1 matching document.' });
  assert.equal(JSON.stringify(output).includes('Private title'), false);
  assert.equal(JSON.stringify(output).includes('OCR secret'), false);
  const failed = companion.companionToolActivity(
    'get_document',
    'output-error',
    { documentId: 42 },
    { token: 'provider-secret' }
  );
  assert.equal(failed.detail.includes('provider-secret'), false);
});

test('Companion model API authenticates session ownership and validates every persisted selection', () => {
  const route = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'api', 'companion', 'models', 'route.ts'),
    'utf8'
  );
  assert.match(route, /requireApiUser\(\)/);
  assert.match(route, /ownedSession\(/);
  assert.match(route, /companionModelSelectionSchema\.safeParse/);
  assert.match(route, /selectionIsAvailable\(catalog,\s*parsed\.data\)/);
  assert.match(route, /setCompanionModelSelection/);
  const chatRoute = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'api', 'companion', 'route.ts'),
    'utf8'
  );
  assert.match(chatRoute, /getCompanionModelSelection/);
  assert.match(chatRoute, /selectionIsAvailable\(catalog,\s*storedSelection\)/);
  assert.doesNotMatch(chatRoute, /body\.(model|provider)/);
});

test('Companion UI renders tool parts but never renders raw inputs or outputs', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'companion.tsx'),
    'utf8'
  );
  assert.match(source, /isToolUIPart\(part\)/);
  assert.match(source, /companionToolActivity\(/);
  assert.doesNotMatch(source, /JSON\.stringify\(part\.(input|output)/);
  assert.doesNotMatch(source, /<pre[^>]*>\s*\{part\.(input|output)/);
});

test('Companion message scrolling never returns a value as an effect cleanup', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'companion.tsx'), 'utf8');
  assert.match(source, /useEffect\(\(\) => \{\s*endRef\.current\?\.scrollIntoView/);
  assert.doesNotMatch(source, /useEffect\(\(\) => endRef\.current\?\.scrollIntoView/);
});
