import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.env.TAGVICO_ACCEPTANCE_BASE_URL || 'http://127.0.0.1:4310';
const mockUrl = process.env.TAGVICO_ACCEPTANCE_MOCK_URL || 'http://127.0.0.1:4010';
const dataDirectory = await mkdtemp(join(tmpdir(), 'tagvico-release-acceptance-'));
const children = [];
const output = [];

const remember = (source, chunk) => {
  const value = String(chunk);
  output.push(`[${source}] ${value}`);
  if (output.length > 80) output.shift();
  process.stderr.write(value);
};

const launch = (name, script, args = [], env = {}) => {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.on('data', (chunk) => remember(name, chunk));
  child.stderr.on('data', (chunk) => remember(name, chunk));
  children.push(child);
  return child;
};

const waitForHealthy = async (url, child, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Release host exited before ${url} became healthy (${child.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The processes need a moment to bind their ports.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const stop = async (child) => {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 7_000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const removeDataDirectory = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dataDirectory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
};

try {
  const mock = launch('mock', 'tests/fixtures/release-mock-server.mjs', [], { PORT: '4010' });
  await waitForHealthy(`${mockUrl}/health`, mock);

  const host = launch('host', 'scripts/start-release-host.mjs', [dataDirectory], {
    TAGVICO_ACCEPTANCE_PORT: '4310',
    TAGVICO_ACCEPTANCE_BACKEND_PORT: '3001'
  });
  await waitForHealthy(`${baseUrl}/health`, host);

  const acceptance = launch('acceptance', 'scripts/release-acceptance.mjs', [], {
    TAGVICO_ACCEPTANCE_BASE_URL: baseUrl,
    TAGVICO_ACCEPTANCE_MOCK_URL: mockUrl
  });
  const exitCode = await new Promise((resolve, reject) => {
    acceptance.once('error', reject);
    acceptance.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`Release acceptance failed with exit code ${exitCode}.\n${output.join('')}`);
  }
} finally {
  for (const child of children.toReversed()) await stop(child);
  await removeDataDirectory();
}
