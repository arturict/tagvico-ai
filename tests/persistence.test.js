const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('database migrations and recovery queues are idempotent', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-db-test-'));
  const modulePath = path.resolve(__dirname, '../dist/models/document.js');
  const script = `
    const model = require(${JSON.stringify(modulePath)});
    (async () => {
      if (model.getSchemaVersion() !== 3) process.exit(2);
      await model.addToOcrQueue(42, 'Test', 'short_content');
      await model.updateOcrQueueStatus(42, 'processing');
      const recovered = await model.recoverInterruptedOcrJobs();
      const item = await model.getOcrQueueItem(42);
      if (recovered !== 1 || item.status !== 'pending') process.exit(3);
      await model.addFailedDocument(42, 'Test', 'ocr_failed', 'ocr', 'test');
      if (!await model.isDocumentFailed(42)) process.exit(4);
      await model.closeDatabase();
    })().catch(() => process.exit(5));
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8' });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
