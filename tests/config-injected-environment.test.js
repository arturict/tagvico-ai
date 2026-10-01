const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

// Next bundles config/config.ts into several chunks. The first copy loads data/.env into
// process.env; a later copy must not mistake those persisted values for Docker-injected ones,
// or Settings saves are written to .env but shadowed by the startup values.
test('a second copy of the config module keeps the startup set of injected keys', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-injected-'));
  fs.writeFileSync(path.join(dataDir, '.env'), 'PAPERLESS_USERNAME=saved-in-settings\nSCAN_INTERVAL=*/30 * * * *\n');
  const script = `
    const configPath = require.resolve('./dist/config/config');
    const first = require(configPath);
    delete require.cache[configPath];
    const second = require(configPath);
    console.log(JSON.stringify({
      loaded: process.env.PAPERLESS_USERNAME,
      first: first.injectedEnvironment.has('PAPERLESS_USERNAME'),
      second: second.injectedEnvironment.has('PAPERLESS_USERNAME'),
      dockerKey: second.injectedEnvironment.has('TAGVICO_DOCKER_INJECTED')
    }));`;
  const env = { ...process.env, TAGVICO_DATA_DIR: dataDir, TAGVICO_DOCKER_INJECTED: 'yes' };
  delete env.PAPERLESS_USERNAME;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(output.loaded, 'saved-in-settings');
  assert.equal(output.first, false);
  assert.equal(output.second, false);
  assert.equal(output.dockerKey, true);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
