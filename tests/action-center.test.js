const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('action center provisions solo households, multi-step cases, and approval audit state', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-actions-test-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tagvico-actions-fixture', version: '3.0.0' }));
  const root = path.resolve(__dirname, '..');
  const script = `
    const assert = require('node:assert/strict');
    const documentModel = require(${JSON.stringify(path.join(root, 'dist/models/document.js'))});
    const actions = require(${JSON.stringify(path.join(root, 'dist/models/actionCenter.js'))});
    const secretBox = require(${JSON.stringify(path.join(root, 'dist/services/secretBox.js'))});
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    assert.equal(workspace.kind, 'solo');
    const adult = actions.addHouseholdMember(workspace.id, 'Alex', 'adult');
    const member = actions.addHouseholdMember(workspace.id, 'Sam', 'member');
    const viewer = actions.addHouseholdMember(workspace.id, 'Robin', 'viewer');
    assert.equal(actions.getWorkspaceForUser(userId).kind, 'family');
    const created = actions.createCase(workspace.id, workspace.member_id, {
      paperlessDocumentId: 42, title: 'Cancel renewal', priority: 'high', dueAt: '2030-01-10',
      steps: [{ title: 'Review terms' }, { title: 'Send cancellation' }]
    });
    assert.equal(created.steps.length, 2);
    assert.equal(actions.dashboard(workspace.id).active, 1);
    assert.throws(() => actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 2, title: 'Bad date', dueAt: '2030-02-30' }), /invalid/);
    assert.throws(() => actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 3, title: 'Bad status', status: 'maybe' }), /status/);
    assert.throws(() => actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 4, title: 'Too many steps', steps: Array.from({ length: 21 }, (_, index) => ({ title: 'Step ' + index })) }), /at most 20/);
    const otherUserId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('other', 'hash').lastInsertRowid);
    const otherWorkspace = actions.ensureWorkspaceForUser(otherUserId, 'other');
    assert.throws(() => actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 5, title: 'Cross household', assigneeMemberId: otherWorkspace.member_id }), /not an active member/);
    const updated = actions.updateStep(workspace.id, created.id, created.steps[0].id, workspace.member_id, { status: 'done' });
    assert.equal(updated.steps[0].status, 'done');
    const approval = actions.createApproval(workspace.id, null, workspace.member_id, 'action.update', { caseId: created.id, patch: { status: 'waiting' } });
    assert.throws(() => actions.decideApproval(workspace.id, approval.id, viewer.id, 'approved'), /cannot approve/);
    assert.equal(actions.decideApproval(workspace.id, approval.id, workspace.member_id, 'approved').status, 'approved');
    const adultApproval = actions.createApproval(workspace.id, null, member.id, 'action.update', { caseId: created.id, patch: { status: 'waiting' } });
    assert.equal(actions.decideApproval(workspace.id, adultApproval.id, adult.id, 'rejected').status, 'rejected');
    assert.throws(() => actions.createApproval(workspace.id, null, workspace.member_id, 'shell.run', {}), /Unsupported/);
    assert.throws(() => actions.createApproval(workspace.id, null, workspace.member_id, 'action.create', { text: 'x'.repeat(129 * 1024) }), /too large/);
    const firstSession = actions.getOrCreateSession(workspace.id, workspace.member_id, 'web');
    assert.equal(actions.getOrCreateSession(workspace.id, workspace.member_id, 'web'), firstSession);
    actions.addMessage(firstSession, 'user', { text: 'Remember this' });
    assert.equal(actions.getSession(workspace.id, firstSession).messages[0].content.text, 'Remember this');
    assert.equal(actions.listSessions(workspace.id, workspace.member_id, 'web')[0].title, 'Remember this');
    const secondSession = actions.createSession(workspace.id, workspace.member_id, 'web');
    actions.renameSession(workspace.id, workspace.member_id, secondSession, 'Renewal research');
    assert.equal(actions.listSessions(workspace.id, workspace.member_id, 'web')[0].title, 'Renewal research');
    assert.throws(() => actions.renameSession(otherWorkspace.id, otherWorkspace.member_id, secondSession, 'Wrong household'), /not found/);
    assert.equal(actions.deleteSession(workspace.id, workspace.member_id, secondSession), true);
    assert.equal(actions.getSession(workspace.id, secondSession), null);
    assert.equal(actions.getCompanionModelSelection(workspace.id, firstSession), null);
    actions.setCompanionModelSelection(workspace.id, firstSession, workspace.member_id, {
      providerInstanceId: 'codex',
      modelId: 'gpt-5.6-terra'
    });
    assert.deepEqual(actions.getCompanionModelSelection(workspace.id, firstSession), {
      providerInstanceId: 'codex',
      modelId: 'gpt-5.6-terra'
    });
    actions.setCompanionModelSelection(workspace.id, firstSession, workspace.member_id, {
      providerInstanceId: 'compatible',
      modelId: 'claude-sonnet-4.6'
    });
    assert.deepEqual(actions.getCompanionModelSelection(workspace.id, firstSession), {
      providerInstanceId: 'compatible',
      modelId: 'claude-sonnet-4.6'
    });
    actions.addMessage(firstSession, 'assistant', {
      text: 'I found one document.',
      activities: [{
        label: 'Searching Paperless',
        detail: 'Found 1 matching document.',
        status: 'succeeded'
      }]
    });
    const storedAssistant = actions.getSession(workspace.id, firstSession).messages.find((message) => message.role === 'assistant');
    assert.equal(storedAssistant.content.activities[0].detail, 'Found 1 matching document.');
    assert.throws(() => actions.setCompanionModelSelection(workspace.id, firstSession, otherWorkspace.member_id, {
      providerInstanceId: 'codex',
      modelId: 'gpt-5.6-sol'
    }), /not found/);
    assert.equal(actions.getSession(otherWorkspace.id, firstSession), null);
    assert.throws(() => actions.createSession(workspace.id, otherWorkspace.member_id, 'web'), /not part/);
    const encrypted = secretBox.encryptSecret('paperless-token');
    assert.notEqual(encrypted, 'paperless-token');
    assert.equal(secretBox.decryptSecret(encrypted), 'paperless-token');
    actions.setPaperlessToken(workspace.id, member.id, encrypted, 12);
    actions.setPaperlessToken(workspace.id, member.id, undefined, 13);
    assert.equal(secretBox.decryptSecret(actions.getMemberSecretRecord(workspace.id, member.id).paperless_token_encrypted), 'paperless-token');
    assert.equal(actions.getMemberSecretRecord(workspace.id, member.id).paperless_user_id, 13);
    assert.equal(Object.hasOwn(actions.listMembers(workspace.id)[0], 'paperless_token_encrypted'), false);
    assert.equal(actions.listSyncTargets().find((target) => target.case_id === created.id).sync_status, 'pending');
    const dueToday = actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 77, title: 'Due today', dueAt: new Date().toISOString().slice(0, 10) });
    assert.ok(dueToday);
    assert.equal(actions.dashboard(workspace.id).overdue, 0);
    documentModel.closeDatabase().then(() => process.exit(0));
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8', env: { ...process.env, JWT_SECRET: 'test-secret-that-is-long-enough-for-tagvico-v3' } });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
