const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');

const modulePath = path.resolve(__dirname, '../dist/models/document.js');

function initializeInChild(dataDirectory) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, TAGVICO_DATA_DIR: dataDirectory };
    delete environment.TAGVICO_BUILD_DATA_ROOT;
    delete environment.TAGVICO_TEST_DATA_ROOT;
    const script = `
      const model = require(${JSON.stringify(modulePath)});
      (async () => {
        if (model.getSchemaVersion() !== 6) process.exit(2);
        await model.closeDatabase();
      })().catch((error) => { console.error(error); process.exit(3); });
    `;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: path.dirname(dataDirectory),
      env: environment,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

test('parallel application starts serialize schema migration and create one valid backup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-db-concurrency-'));
  const dataDirectory = path.join(root, 'data');
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => initializeInChild(dataDirectory)));
    for (const result of results) {
      assert.equal(result.code, 0, result.stderr || result.stdout);
    }

    const backupNames = fs.readdirSync(dataDirectory).filter((name) => name.endsWith('.bak'));
    assert.equal(backupNames.length, 1);

    const live = new Database(path.join(dataDirectory, 'documents.db'), { readonly: true });
    assert.equal(live.pragma('user_version', { simple: true }), 6);
    assert.equal(live.pragma('integrity_check', { simple: true }), 'ok');
    live.close();

    const backup = new Database(path.join(dataDirectory, backupNames[0]), { readonly: true });
    assert.equal(backup.pragma('user_version', { simple: true }), 0);
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    backup.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
