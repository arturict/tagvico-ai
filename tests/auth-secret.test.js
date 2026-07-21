const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'dist/services/authSecret.js');

function readSecretInChild(cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, ...extraEnv, TAGVICO_DATA_DIR: path.join(cwd, 'private-data') };
    delete environment.JWT_SECRET;
    const child = spawn(process.execPath, ['-e', `process.stdout.write(require(${JSON.stringify(modulePath)}).getJwtSecret())`], { cwd, env: environment, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `child exited ${code}`)));
  });
}

test('concurrent first starts converge on one durable JWT secret', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-auth-secret-'));
  try {
    const secrets = await Promise.all(Array.from({ length: 8 }, () => readSecretInChild(cwd)));
    assert.equal(new Set(secrets).size, 1);
    assert.equal(secrets[0].length, 128);
    assert.equal(fs.readFileSync(path.join(cwd, 'private-data', '.jwt-secret'), 'utf8').trim(), secrets[0]);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('short explicit JWT secrets fail closed', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-auth-short-'));
  try {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)}).getJwtSecret()`], { cwd, encoding: 'utf8', env: { ...process.env, JWT_SECRET: 'too-short', TAGVICO_DATA_DIR: path.join(cwd, 'data') } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /at least 32 characters/);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
