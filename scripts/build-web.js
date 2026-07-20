'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const buildDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-web-build-'));
try {
  const environment = { ...process.env, TAGVICO_BUILD_DATA_ROOT: buildDataDir };
  delete environment.TAGVICO_DATA_DIR;
  const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: process.cwd(),
    // Next builds routes in parallel worker processes. Give each worker its own
    // disposable database and JWT secret instead of racing on shared state.
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  fs.rmSync(buildDataDir, { recursive: true, force: true });
}
