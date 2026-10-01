const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// The feed helpers are plain TypeScript without imports; compile them the way the web build does
// so the test does not depend on the Node version's built-in type stripping.
function loadDates() {
  const source = fs.readFileSync(path.join(root, 'src/components/inbox/dates.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('module', 'exports', outputText)(module, module.exports);
  return module.exports;
}

test('household dates follow Europe/Zurich, not the server clock', () => {
  const { zurichToday, zurichDateOf, parseSqliteTimestamp, shortDateTime } = loadDates();
  // 22:30 UTC on 1 Oct is half past midnight on 2 Oct in Zurich (summer time).
  assert.equal(zurichToday(new Date('2026-10-01T22:30:00Z')), '2026-10-02');
  assert.equal(zurichToday(new Date('2026-10-01T21:30:00Z')), '2026-10-01');
  // Winter time: 23:30 UTC on New Year's Eve is already 1 Jan.
  assert.equal(zurichToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(zurichDateOf('2026-10-01 22:30:00'), '2026-10-02');
  assert.equal(parseSqliteTimestamp('not a date'), null);
  assert.equal(shortDateTime('2026-10-01 05:39:19'), '1 Oct, 07:39');
});

test('feed groups come from the due date relative to today', () => {
  const { dueGroup, dueChip, addDays } = loadDates();
  const today = '2026-10-01';
  assert.equal(dueGroup('2026-09-30', today), 'overdue');
  assert.equal(dueGroup('2026-10-01', today), 'week');
  assert.equal(dueGroup('2026-10-08', today), 'week');
  assert.equal(dueGroup('2026-10-09', today), 'later');
  assert.equal(dueGroup(null, today), 'later');
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.deepEqual(dueChip('2026-09-25', today), { label: '6 days overdue · 25 Sep', tone: 'overdue' });
  assert.deepEqual(dueChip('2026-10-01', today), { label: 'Due today · 1 Oct', tone: 'soon' });
  assert.deepEqual(dueChip('2026-10-12', today), { label: 'Due 12 Oct', tone: 'calm' });
});

test('amounts are read from the case text and never invented', () => {
  const { extractAmount } = loadDates();
  assert.equal(extractAmount('Pay EWL', 'Reminder for CHF 214.35, was due 25 Sep.'), 'CHF 214.35');
  assert.equal(extractAmount('Swisscom', '89.90 CHF within 10 days'), 'CHF 89.90');
  assert.equal(extractAmount('Tax', "Balance CHF 1'200.50"), 'CHF 1200.50');
  assert.equal(extractAmount('Sign school trip consent', 'Return the signed slip by Friday.'), null);
  assert.equal(extractAmount('Renewal', 'Three months notice, 30 days'), null);
});

test('assigning, reassigning and finishing cases moves the per-person workload', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-workload-test-'));
  const script = `
    const assert = require('node:assert/strict');
    const documentModel = require(${JSON.stringify(path.join(root, 'dist/models/document.js'))});
    const actions = require(${JSON.stringify(path.join(root, 'dist/models/actionCenter.js'))});
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const sandra = actions.addHouseholdMember(workspace.id, 'Sandra', 'adult');
    const lena = actions.addHouseholdMember(workspace.id, 'Lena', 'member');
    const open = (assignee) => actions.listCases(workspace.id, { assignee }).filter((item) => ['suggested', 'open', 'waiting'].includes(item.status)).length;

    const first = actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 1, title: 'Pay bill', dueAt: '2026-10-02' });
    const second = actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 2, title: 'Sign slip' });
    assert.equal(open(sandra.id), 0);

    actions.updateCase(workspace.id, first.id, workspace.member_id, { assigneeMemberId: sandra.id });
    actions.updateCase(workspace.id, second.id, workspace.member_id, { assigneeMemberId: sandra.id });
    assert.equal(open(sandra.id), 2);

    actions.updateCase(workspace.id, second.id, workspace.member_id, { assigneeMemberId: lena.id });
    assert.equal(open(sandra.id), 1);
    assert.equal(open(lena.id), 1);

    // Finished and dismissed cases leave the open count; reopening brings them back.
    actions.updateCase(workspace.id, first.id, workspace.member_id, { status: 'done' });
    assert.equal(open(sandra.id), 0);
    actions.updateCase(workspace.id, first.id, workspace.member_id, { status: 'open' });
    assert.equal(open(sandra.id), 1);
    actions.updateCase(workspace.id, first.id, workspace.member_id, { status: 'dismissed' });
    assert.equal(open(sandra.id), 0);

    actions.updateCase(workspace.id, second.id, workspace.member_id, { assigneeMemberId: null });
    assert.equal(open(lena.id), 0);
    assert.equal(actions.getCase(workspace.id, second.id).assigneeMemberId, null);

    // A document carries one action; creating a second says so in plain words.
    assert.throws(() => actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 1, title: 'Again' }), /Document #1 already has an action: “Pay bill”/);

    // Assignment is limited to this household's active members.
    const otherUser = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('other', 'hash').lastInsertRowid);
    const other = actions.ensureWorkspaceForUser(otherUser, 'other');
    assert.throws(() => actions.updateCase(workspace.id, second.id, workspace.member_id, { assigneeMemberId: other.member_id }), /not an active member/);
    assert.equal(actions.getCase(workspace.id, second.id).assigneeMemberId, null);
    documentModel.closeDatabase().then(() => process.exit(0));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, JWT_SECRET: 'test-secret-that-is-long-enough-for-workload', TAGVICO_DATA_DIR: path.join(cwd, 'data') },
    timeout: 30_000
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('only owners and adults decide approvals, and a decision is final', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-approval-roles-test-'));
  const script = `
    const assert = require('node:assert/strict');
    const documentModel = require(${JSON.stringify(path.join(root, 'dist/models/document.js'))});
    const actions = require(${JSON.stringify(path.join(root, 'dist/models/actionCenter.js'))});
    const executor = require(${JSON.stringify(path.join(root, 'dist/services/approvalExecutor.js'))});
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const adult = actions.addHouseholdMember(workspace.id, 'Alex', 'adult');
    const member = actions.addHouseholdMember(workspace.id, 'Sam', 'member');
    const viewer = actions.addHouseholdMember(workspace.id, 'Robin', 'viewer');
    const ask = () => actions.createApproval(workspace.id, null, member.id, 'action.create', { paperlessDocumentId: 7, title: 'Send receipts' });

    const approval = ask();
    for (const denied of [member, viewer]) {
      assert.throws(() => actions.decideApproval(workspace.id, approval.id, denied.id, 'approved'), /cannot approve/);
      assert.throws(() => actions.decideApproval(workspace.id, approval.id, denied.id, 'rejected'), /cannot approve/);
    }
    assert.equal(actions.getApproval(workspace.id, approval.id).status, 'pending');
    assert.equal(actions.listApprovals(workspace.id).length, 1);

    assert.equal(actions.decideApproval(workspace.id, approval.id, adult.id, 'rejected').status, 'rejected');
    assert.throws(() => actions.decideApproval(workspace.id, approval.id, workspace.member_id, 'approved'), /no longer pending/);
    assert.equal(actions.listApprovals(workspace.id).length, 0);

    // A failed write keeps the real reason, which the person page and the feed show.
    const patch = actions.createApproval(workspace.id, null, member.id, 'paperless.patch', { documentId: 7, patch: { title: 'New title' } });
    actions.decideApproval(workspace.id, patch.id, workspace.member_id, 'approved');
    executor.executeApproval(workspace.id, patch.id, workspace.member_id).then(
      () => { throw new Error('the Paperless write should have failed without credentials'); },
      (error) => {
        const stored = actions.getApproval(workspace.id, patch.id);
        assert.equal(stored.status, 'failed');
        assert.equal(stored.result.error, error.message);
        assert.match(stored.result.error, /credentials/);
      }
    ).then(() => documentModel.closeDatabase()).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, JWT_SECRET: 'test-secret-that-is-long-enough-for-roles', TAGVICO_DATA_DIR: path.join(cwd, 'data'), PAPERLESS_API_URL: '', PAPERLESS_API_TOKEN: '' },
    timeout: 30_000
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
