const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('approved local actions remain executed when Paperless sync is temporarily unavailable', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-approval-test-'));
  const root = path.resolve(__dirname, '..');
  const script = `
    const assert = require('node:assert/strict');
    const documentModel = require(${JSON.stringify(path.join(root, 'dist/models/document.js'))});
    const actions = require(${JSON.stringify(path.join(root, 'dist/models/actionCenter.js'))});
    const executor = require(${JSON.stringify(path.join(root, 'dist/services/approvalExecutor.js'))});
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const approval = actions.createApproval(workspace.id, null, workspace.member_id, 'action.create', { paperlessDocumentId: 42, title: 'Durable local action' });
    actions.decideApproval(workspace.id, approval.id, workspace.member_id, 'approved');
    executor.executeApproval(workspace.id, approval.id, workspace.member_id).then(async (completed) => {
      assert.equal(completed.status, 'executed');
      assert.equal(completed.result.sync.ok, false);
      assert.match(completed.result.sync.error, /credentials/);
      assert.equal(completed.result.case.title, 'Durable local action');
      assert.equal(actions.getCase(workspace.id, completed.result.case.id).syncStatus, 'error');

      const paperlessApproval = actions.createApproval(workspace.id, null, workspace.member_id, 'paperless.patch', { documentId: 42, patch: { title: 'Remote only' } });
      actions.decideApproval(workspace.id, paperlessApproval.id, workspace.member_id, 'approved');
      await assert.rejects(() => executor.executeApproval(workspace.id, paperlessApproval.id, workspace.member_id), /credentials/);
      assert.equal(actions.getApproval(workspace.id, paperlessApproval.id).status, 'failed');
      await documentModel.closeDatabase();
    }).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
  `;
  const environment = { ...process.env, JWT_SECRET: 'test-secret-that-is-long-enough-for-approvals', TAGVICO_DATA_DIR: path.join(cwd, 'data'), PAPERLESS_API_URL: '', PAPERLESS_API_TOKEN: '' };
  const result = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8', env: environment, timeout: 30_000 });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
