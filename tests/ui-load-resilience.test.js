'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadTypeScriptModule(relativePath) {
  const output = typescript.transpileModule(source(relativePath), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022
    }
  }).outputText;
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', output)(require, loaded, loaded.exports);
  return loaded.exports;
}

test('workspace JSON requests report HTTP errors, time out and clear timers', async () => {
  const { fetchJson, HttpRequestError } = loadTypeScriptModule('src/lib/client/fetch-json.ts');
  const originalFetch = globalThis.fetch;
  const originalClearTimeout = globalThis.clearTimeout;
  let clearedTimers = 0;

  globalThis.clearTimeout = (timer) => {
    clearedTimers += 1;
    return originalClearTimeout(timer);
  };

  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ value: 42 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    assert.deepEqual(await fetchJson('/ok'), { value: 42 });

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
    await assert.rejects(
      fetchJson('/error'),
      (error) => error instanceof HttpRequestError && error.status === 503 && error.message === 'Unavailable'
    );

    globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    await assert.rejects(fetchJson('/slow', { timeoutMs: 5 }), /The request timed out\. Try again\./);
    assert.equal(clearedTimers, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('dashboard replaces a failed initial skeleton with a retryable error', () => {
  const dashboard = source('src/components/automation-dashboard.tsx');
  const errorBranch = dashboard.indexOf('!summary && loadError');
  const skeletonBranch = dashboard.indexOf('!summary ? <section className="workspace-skeleton"');

  assert.ok(errorBranch >= 0);
  assert.ok(skeletonBranch > errorBranch);
  assert.match(dashboard, /title="Document metrics are unavailable"/);
  assert.match(dashboard, /onRetry=\{\(\) => void load\(\)\}/);
});

test('history renders empty results only after a successful load', () => {
  const history = source('src/components/history-workspace.tsx');

  assert.match(history, /loadState === 'error' \? <WorkspaceLoadError/);
  assert.match(history, /loadState === 'loading' && !rows\.length/);
  assert.match(history, /loadState === 'ready' \? <div className="empty"/);
  assert.doesNotMatch(history, /loadState === 'error' && !rows\.length/);
});

test('operations exposes independent status, OCR, failure and ignored load failures', () => {
  const operations = source('src/components/operations-workspace.tsx');

  assert.match(operations, /Promise\.allSettled\(\[loadStatus\(\), loadOcr\(\), loadFailures\(\), loadIgnored\(\)\]\)/);
  assert.doesNotMatch(operations, /Promise\.all\(\[\s*loadStatus\(\),\s*loadOcr\(\),\s*loadFailures\(\)/);
  assert.match(operations, /title="Recovery status is unavailable"/);
  assert.match(operations, /title="OCR queue is unavailable"/);
  assert.match(operations, /title="Failure queue is unavailable"/);
  assert.match(operations, /title="Ignored documents are unavailable"/);
  assert.match(operations, /onRetry=\{\(\) => void loadStatus\(\)\}/);
  assert.match(operations, /onRetry=\{\(\) => void loadOcr\(\)\}/);
  assert.match(operations, /onRetry=\{\(\) => void loadFailures\(\)\}/);
  assert.match(operations, /onRetry=\{\(\) => void loadIgnored\(\)\}/);
});
