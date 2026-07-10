const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const home = process.env.COPILOT_HOME || path.join(process.cwd(), 'data', 'copilot');
const executable = process.env.COPILOT_BINARY || path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'copilot.cmd' : 'copilot'
);

fs.mkdirSync(home, { recursive: true, mode: 0o700 });
const result = spawnSync(executable, ['--no-color', 'login'], {
  stdio: 'inherit',
  env: { ...process.env, COPILOT_HOME: home }
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
