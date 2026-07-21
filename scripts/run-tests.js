'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-tests-'));
const environment = { ...process.env, TAGVICO_TEST_DATA_ROOT: testDataRoot };
delete environment.TAGVICO_DATA_DIR;

try {
  const tests = fs.readdirSync(path.join(process.cwd(), 'tests'))
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join('tests', name));
  const result = spawnSync(process.execPath, ['--test', ...tests], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  fs.rmSync(testDataRoot, { recursive: true, force: true });
}
