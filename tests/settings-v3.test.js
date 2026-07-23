const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-settings-v3-'));
process.env.TAGVICO_DATA_DIR = dataDir;
process.env.SCAN_INTERVAL = '5 * * * *';
process.env.AI_PROVIDER = 'ollama';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
fs.writeFileSync(path.join(dataDir, '.env'), [
  'TAGVICO_AI_INITIAL_SETUP=yes',
  'TAGVICO_AI_VERSION=3.0.0',
  'PAPERLESS_API_URL=http://paperless.internal:8000',
  'PAPERLESS_API_TOKEN=paperless-secret-value',
  'PAPERLESS_USERNAME=admin',
  'AI_PROVIDER=compatible',
  'COMPATIBLE_BASE_URL=http://proxy.internal:8317/v1',
  'COMPATIBLE_API_KEY=proxy-secret-value',
  'COMPATIBLE_MODEL=gpt-5.6-terra',
  'AI_MODEL=gpt-5.6-terra',
  'API_KEY=external-secret-value',
  "EXTERNAL_API_HEADERS='{\"Authorization\":\"Bearer header-secret-value\"}'",
  "EXTERNAL_API_BODY='{\"password\":\"body-secret-value\"}'",
  'AI_PROCESSING_MODE=flex',
  'SCAN_INTERVAL=*/30 * * * *',
  "OWNER_PROFILES=`alex: O'Reilly\nfinance: vendor bills`",
  'CONTROLLED_TAGGING_ENABLED=yes',
  'TAG_MAX_PER_DOCUMENT=4'
].join('\n'));

const service = require('../dist/services/settingsV3Service');
const setupService = require('../dist/services/setupService');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('GET settings redacts every secret while retaining configured metadata', async () => {
  const settings = await service.getSettings();
  const serialized = JSON.stringify(settings);
  assert.equal(serialized.includes('paperless-secret-value'), false);
  assert.equal(serialized.includes('proxy-secret-value'), false);
  assert.equal(serialized.includes('external-secret-value'), false);
  assert.equal(serialized.includes('header-secret-value'), false);
  assert.equal(serialized.includes('body-secret-value'), false);
  assert.equal(settings.paperless.token.configured, true);
  assert.equal(settings.security.apiKey.configured, true);
  assert.equal(settings.security.externalApiHeaders.configured, true);
  assert.equal(settings.security.externalApiBody.configured, true);
  assert.equal(settings.ai.providers.find((provider) => provider.instanceId === 'compatible').configuration.apiKey.configured, true);
});

test('GET settings follows injected-environment precedence and preserves flex mode', async () => {
  const settings = await service.getSettings();
  assert.equal(settings.automation.scanInterval, '5 * * * *');
  assert.equal(settings.automation.processingMode, 'flex');
});

test('PATCH uses a revision and empty secret fields retain existing values', async () => {
  const before = await service.getSettings();
  const after = await service.patchSettings({
    revision: before.revision,
    patch: {
      provider: { instanceId: 'compatible', values: { apiKey: '', baseUrl: 'http://127.0.0.1:8317/v1' } },
      ai: { activeProviderInstanceId: 'compatible', activeModelId: 'gpt-5.6-sol' }
    }
  });
  const persisted = await setupService.loadConfig();
  assert.equal(persisted.COMPATIBLE_API_KEY, 'proxy-secret-value');
  assert.equal(persisted.COMPATIBLE_BASE_URL, 'http://127.0.0.1:8317/v1');
  assert.equal(persisted.TAGVICO_UI_MANAGED_AI_SELECTION, 'yes');
  assert.equal(after.ai.activeProviderInstanceId, 'compatible');
  assert.equal(after.ai.activeModelId, 'gpt-5.6-sol');
  assert.equal(after.automation.scanInterval, '5 * * * *');
  assert.notEqual(after.revision, before.revision);
});

test('PATCH stores the canonical Paperless API base and retains empty write-only templates', async () => {
  const before = await service.getSettings();
  await service.patchSettings({
    revision: before.revision,
    patch: {
      paperless: { baseUrl: 'http://paperless.example:8000/' },
      security: { externalApiHeaders: '', externalApiBody: '' }
    }
  });
  const persisted = await setupService.loadConfig();
  assert.equal(persisted.PAPERLESS_API_URL, 'http://paperless.example:8000/api');
  assert.equal(persisted.EXTERNAL_API_HEADERS, '{"Authorization":"Bearer header-secret-value"}');
  assert.equal(persisted.EXTERNAL_API_BODY, '{"password":"body-secret-value"}');
  assert.equal(persisted.OWNER_PROFILES, "alex: O'Reilly\nfinance: vendor bills");
});

test('stale revisions fail without overwriting newer settings', async () => {
  const current = await service.getSettings();
  await assert.rejects(
    service.patchSettings({
      revision: '000000000000000000000000',
      patch: { automation: { automaticProcessing: true } }
    }),
    (error) => error && error.status === 409
  );
  assert.equal((await service.getSettings()).revision, current.revision);
});

test('invalid tag limits are rejected by the typed patch schema', async () => {
  const current = await service.getSettings();
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { tags: { maximumPerDocument: 100 } }
  }), /Number must be less than or equal to 10/);
});

test('PATCH rejects unsupported enrichment methods, unsafe URLs and malformed JSON', async () => {
  const current = await service.getSettings();
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiMethod: 'PATCH' } }
  }));
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiUrl: 'https://user:password@example.com/lookup' } }
  }), /without embedded credentials/);
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiHeaders: 'not-json' } }
  }), /valid JSON object/);
});
