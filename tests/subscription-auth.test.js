const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Codex model catalog exposes only visible models in server order', () => {
  const service = require('../dist/services/codexAuthService');
  const models = service.normalizeModels({
    data: [
      {
        id: 'gpt-visible',
        displayName: 'GPT Visible',
        hidden: false,
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Fast' }]
      },
      { id: 'gpt-hidden', displayName: 'GPT Hidden', hidden: true }
    ]
  });

  assert.deepEqual(models, [{
    id: 'gpt-visible',
    name: 'GPT Visible',
    isDefault: true,
    reasoningEfforts: [{ id: 'low', description: 'Fast' }]
  }]);
});

test('Codex subprocesses exclude oversized Next.js internals from their environment', () => {
  const service = require('../dist/services/codexAuthService');
  const oversizedKey = '__NEXT_PRIVATE_STANDALONE_CONFIG';
  const previous = process.env[oversizedKey];
  process.env[oversizedKey] = 'x'.repeat(512 * 1024);
  try {
    const environment = service.environment();
    assert.equal(environment[oversizedKey], undefined);
    assert.equal(environment.CODEX_HOME, process.env.CODEX_HOME || 'data/codex');
    assert.ok(environment.PATH);
    assert.ok(Buffer.byteLength(JSON.stringify(environment), 'utf8') < 128 * 1024);
  } finally {
    if (previous === undefined) delete process.env[oversizedKey];
    else process.env[oversizedKey] = previous;
  }
});

test('Copilot login parser accepts the official CLI device-code message', () => {
  const service = require('../dist/services/copilotAuthService');
  assert.deepEqual(
    service.parseChallenge('To authenticate, visit https://github.com/login/device and enter code A1B2-C3D4.\nWaiting for authorization...'),
    { verificationUrl: 'https://github.com/login/device', userCode: 'A1B2-C3D4' }
  );
  assert.equal(service.parseChallenge('Waiting for authorization...'), null);
});

test('settings render account-scoped runtime models and model capabilities', () => {
  const root = path.join(__dirname, '..');
  const picker = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'model-picker.tsx'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'settings-workspace.tsx'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'services', 'providerRegistry.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'routes', 'setup.ts'), 'utf8');

  assert.doesNotMatch(fs.readFileSync(path.join(root, 'services', 'codexAuthService.ts'), 'utf8'), /gpt-5\.6-(?:luna|terra|sol)/);
  assert.match(picker, /Availability and capabilities come from the selected runtime/);
  assert.match(picker, /Curated suggestions/);
  assert.match(workspace, /activeModel\?\.options/);
  assert.match(workspace, /modelOptions/);
  assert.match(registry, /supported by the signed-in ChatGPT account|returned by the signed-in ChatGPT account|Official Codex runtime/);
  assert.match(routes, /\/api\/codex\/models/);
  assert.match(routes, /\/api\/copilot\/login/);
  assert.match(routes, /\/api\/copilot\/models/);
  assert.match(routes, /'ollamaCloudApiKey'/);
  assert.match(routes, /'copilotGitHubToken'/);
  const copilotService = fs.readFileSync(path.join(root, 'services', 'copilotService.ts'), 'utf8');
  assert.match(copilotService, /appendConfidencePrompt/);
});

test('provider validation never logs reusable API keys', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'services', 'setupService.ts'), 'utf8');
  assert.doesNotMatch(source, /console\.log\(['"]Custom AI config:/);
  assert.match(source, /hasApiKey:\s*Boolean\(apiKey\)/);
});

test('dashboard loads an available ECharts 5 build', () => {
  const appHead = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'app-head.ejs'), 'utf8');
  assert.match(appHead, /echarts\/5\.6\.0\/echarts\.min\.js/);
  assert.doesNotMatch(appHead, /echarts\/5\.5\.1/);
});

test('lockfile includes Linux native subscription runtimes for Docker', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
  assert.ok(lock.packages['node_modules/@openai/codex-linux-x64']);
  assert.ok(lock.packages['node_modules/@github/copilot-linux-x64']);
});
