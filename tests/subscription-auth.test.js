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

test('Copilot login parser accepts the official CLI device-code message', () => {
  const service = require('../dist/services/copilotAuthService');
  assert.deepEqual(
    service.parseChallenge('To authenticate, visit https://github.com/login/device and enter code A1B2-C3D4.\nWaiting for authorization...'),
    { verificationUrl: 'https://github.com/login/device', userCode: 'A1B2-C3D4' }
  );
  assert.equal(service.parseChallenge('Waiting for authorization...'), null);
});

test('settings render account-scoped model selects and correct provider icons', () => {
  const root = path.join(__dirname, '..');
  const template = fs.readFileSync(path.join(root, 'views', 'partials', 'config-form.ejs'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'routes', 'setup.ts'), 'utf8');

  assert.match(template, /<select id="codexModel"/);
  assert.match(template, /<select id="copilotModel"/);
  assert.match(template, /provider-icons\/opencode-go\.svg/);
  assert.match(template, /provider-icons\/github-copilot\.svg/);
  assert.match(routes, /\/api\/codex\/models/);
  assert.match(routes, /\/api\/copilot\/login/);
  assert.match(routes, /\/api\/copilot\/models/);
  assert.match(routes, /'ollamaCloudApiKey'/);
  assert.match(routes, /'copilotGitHubToken'/);
  const copilotService = fs.readFileSync(path.join(root, 'services', 'copilotService.ts'), 'utf8');
  assert.match(copilotService, /appendConfidencePrompt/);
});
