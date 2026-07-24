const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('durable rescans preserve history and original snapshots', () => {
  const modelPath = path.join(root, 'dist/models/document.js');
  const historyPath = path.join(root, 'dist/services/historyService.js');
  const script = `
    const model = require(${JSON.stringify(modelPath)});
    const history = require(${JSON.stringify(historyPath)});
    (async () => {
      const id = 947001;
      await model.purgeLocalDocument(id);
      await model.saveOriginalSnapshot(id, {
        title: 'Original title',
        tags: [7],
        correspondent: 11,
        document_type: 3,
        created: '2026-01-01',
        language: 'de',
        custom_fields: [{ field: 9, value: true }]
      });
      history.addToHistory(id, [8], 'AI title', 'Sender', [{ field: 'title', before: 'Original title', after: 'AI title' }]);
      if (!await model.requestRescan(id, 'test')) process.exit(2);
      if (!await model.getOriginalData(id)) process.exit(3);
      if (history.getAllByDocumentId(id).length !== 1) process.exit(4);
      if (!(await model.getPendingRescanRequests()).some((row) => row.document_id === id)) process.exit(5);
      await model.ignoreDocument(id, 'AI title', 'encrypted');
      if (await model.requestRescan(id, 'test')) process.exit(6);
      if (!await model.isDocumentIgnored(id)) process.exit(7);
      if (!await model.unignoreDocument(id)) process.exit(8);
      if (await model.isDocumentIgnored(id)) process.exit(9);
      if (!(await model.getPendingRescanRequests()).some((row) => row.document_id === id)) process.exit(10);
      await model.purgeLocalDocument(id);
      await model.closeDatabase();
    })().catch((error) => {
      console.error(error);
      process.exit(11);
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    env: process.env,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('automatic scanner records local success only after Paperless accepts the write', () => {
  for (const file of ['server.ts', 'routes/setup.ts']) {
    const value = source(file);
    const writeIndex = value.indexOf('paperlessService.updateDocument');
    const historyIndex = value.indexOf('historyService.addToHistory', writeIndex);
    const processedIndex = value.indexOf('documentModel.addProcessedDocument', historyIndex);
    assert.ok(writeIndex >= 0, `${file} must write to Paperless`);
    assert.ok(historyIndex > writeIndex, `${file} must write history after Paperless`);
    assert.ok(processedIndex > historyIndex, `${file} must mark processed last`);
  }
});

test('activity and recovery expose the complete operator workflows', () => {
  const history = source('src/components/history-workspace.tsx');
  assert.match(history, /Rescan selected/);
  assert.match(history, /Validate history/);
  assert.match(history, /Restore original/);
  assert.match(history, /Token usage/);
  assert.match(history, /Custom Fields/i);
  assert.match(history, /\/api\/history\/\$\{row\.document_id\}\/details/);

  const recovery = source('src/components/operations-workspace.tsx');
  assert.match(recovery, /\/api\/ignored/);
  assert.match(recovery, /Permanent skip list/);
  assert.match(recovery, /Un-ignore/);
  assert.match(recovery, /\/api\/failures\/\$\{row\.document_id\}\/ignore/);

  const navigation = source('src/components/app-navigation-shell.tsx');
  assert.match(navigation, /\/api\/navigation\/counts/);
  assert.match(navigation, /nav-badge/);
  assert.match(navigation, /\/changelog/);
});

test('AI and OCR processing use the same bounded retry discipline', () => {
  const config = source('config/config.ts');
  const server = source('server.ts');
  const setup = source('routes/setup.ts');
  const ocr = source('services/ocrService.ts');
  assert.match(config, /AI_MAX_RETRIES \|\| '3'/);
  assert.match(server, /attempt <= config\.maxRetries/);
  assert.match(setup, /attempt <= config\.maxRetries/);
  assert.match(ocr, /const maxAttempts = Math\.max\(1, Number\(config\.maxRetries\) \|\| 3\)/);
  assert.match(ocr, /progress\('retry'/);
});
