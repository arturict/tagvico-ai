const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const companion = require('../dist/contracts/companion');
const modelService = require('../dist/services/companionModelService');
const research = require('../dist/services/companionResearchService');

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

test('Companion excludes live catalog entries that cannot answer chat requests', () => {
  for (const id of ['text-embedding-3-small', 'whisper-1', 'tts-1', 'omni-moderation-latest', 'gpt-image-2', 'gpt-realtime-2', 'sora-2']) {
    assert.equal(modelService.supportsCompanionModel({ id }), false, id);
  }
  for (const id of ['gpt-5.6-terra', 'claude-sonnet-4.6', 'gemma3:latest', 'gpt-4o-search-preview']) {
    assert.equal(modelService.supportsCompanionModel({ id }), true, id);
  }
});

test('retired and unsupported provider definitions are never exposed as verified Companion runtimes', () => {
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

test('Companion exposes persistent conversation controls and owner-scoped session APIs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'companion.tsx'), 'utf8');
  const sessionsRoute = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'companion', 'sessions', 'route.ts'), 'utf8');
  const sessionRoute = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'companion', 'sessions', '[sessionId]', 'route.ts'), 'utf8');
  assert.match(source, /New chat/);
  assert.match(source, /api\/companion\/sessions/);
  assert.match(source, /router\.push\(`\/companion\?chat=/);
  assert.match(sessionsRoute, /workspace\.memberId/);
  assert.match(sessionRoute, /renameSession\(workspace\.householdId,\s*workspace\.memberId/);
  assert.match(sessionRoute, /deleteSession\(workspace\.householdId,\s*workspace\.memberId/);
});

test('tag unification reuses the verified Companion catalog instead of advertising unverified account providers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'tagUnificationInference.ts'), 'utf8');
  assert.match(source, /companionModelService\.getCompanionModelCatalog\(\)/);
  assert.doesNotMatch(source, /configuredProviders[\s\S]*definition\.fields[\s\S]*field\.required/);
});

test('tool presentation exposes safe research metadata but strips OCR, proposal payloads and provider errors', () => {
  assert.deepEqual(companion.safeCompanionToolInput('search_documents', {
    query: 'private tax return 2026'
  }), { query: 'private tax return 2026' });
  assert.deepEqual(companion.safeCompanionToolInput('propose_action', {
    title: 'Secret cancellation',
    summary: 'private content'
  }), {});
  const output = companion.safeCompanionToolOutput(
    'search_documents',
    { query: 'secret' },
    [{ id: 1, title: 'Private title', content: 'OCR secret' }]
  );
  assert.equal(output.summary, 'Found 1 matching document.');
  assert.deepEqual(output.documents, [{ id: 1, title: 'Private title' }]);
  assert.equal(JSON.stringify(output).includes('OCR secret'), false);
  const failed = companion.companionToolActivity(
    'get_document',
    'output-error',
    { documentId: 42 },
    { token: 'provider-secret' }
  );
  assert.equal(failed.detail.includes('provider-secret'), false);
});

test('subscription adapters only research clear Paperless intents', () => {
  assert.deepEqual(research.planCompanionResearch('hey'), {
    steps: [],
    readSearchResults: false
  });
  assert.deepEqual(research.planCompanionResearch('How many documents are in Paperless?'), {
    steps: [{ toolName: 'count_documents', input: {} }],
    readSearchResults: false
  });
  assert.deepEqual(research.planCompanionResearch('Show my newest documents'), {
    steps: [{ toolName: 'list_recent_documents', input: { limit: 8 } }],
    readSearchResults: false
  });
  const due = research.planCompanionResearch('Find my insurance invoice and tell me when it is due');
  assert.equal(due.steps.some((step) => step.toolName === 'search_documents'), true);
  assert.equal(due.readSearchResults, true);
  assert.equal(
    research.planCompanionResearch('Which open actions need my attention?').steps[0].toolName,
    'list_actions'
  );
  assert.deepEqual(research.planCompanionResearch('Summarize document #42'), {
    steps: [{ toolName: 'get_document', input: { documentId: 42 } }],
    readSearchResults: false
  });
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

test('Companion UI renders safe tool traces without dumping raw model objects', () => {
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

test('navigation hides Review immediately in automatic write mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'app-navigation-shell.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'settings', 'settings-workspace.tsx'), 'utf8');
  assert.match(source, /href !== '\/review' \|\| writeMode === 'review'/);
  assert.match(source, /tagvico:write-mode/);
  assert.match(settings, /new CustomEvent\('tagvico:write-mode'/);
});

test('provider model lists have their own bounded scrolling surfaces', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');
  assert.match(css, /\.settings-model-list\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.companion-model-list\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
});
