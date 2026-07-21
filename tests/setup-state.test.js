const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('saved setup state is detected immediately without contacting unavailable providers', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-setup-state-'));
  process.env.TAGVICO_DATA_DIR = dataDir;
  fs.writeFileSync(path.join(dataDir, '.env'), [
    'TAGVICO_AI_INITIAL_SETUP=yes',
    'PAPERLESS_API_URL=http://127.0.0.1:1/api',
    'PAPERLESS_API_TOKEN=unreachable-release-test'
  ].join('\n'));
  const setupService = require('../dist/services/setupService');
  const started = Date.now();
  try {
    assert.equal(await setupService.isConfigured(), true);
    assert.ok(Date.now() - started < 500, 'local setup detection must not wait for provider retries');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
