const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('only the owner manages profiles, and the owner role, sign-ins and names stay protected', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-cwd-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-data-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tagvico-members-fixture', version: '3.5.0' }));
  const script = `
    const assert = require('node:assert/strict');
    const dist = ${JSON.stringify(path.join(root, 'dist'))};
    const documentModel = require(dist + '/models/document.js');
    const actions = require(dist + '/models/actionCenter.js');
    const secretBox = require(dist + '/services/secretBox.js');
    const members = require(dist + '/services/householdMembersService.js');
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const household = workspace.id;
    const owner = workspace.member_id;
    const throwsWith = (fn, status, pattern, field) => {
      try { fn(); } catch (error) {
        assert.equal(error.status, status, error.message);
        assert.match(error.message, pattern);
        if (field) assert.equal(error.field, field);
        return;
      }
      assert.fail('expected an error matching ' + pattern);
    };

    // Add, with validation.
    const lena = members.addMember(household, owner, { displayName: '  Lena  ', role: 'member' });
    assert.equal(lena.display_name, 'Lena');
    assert.equal(lena.role, 'member');
    assert.equal(lena.has_login, false);
    throwsWith(() => members.addMember(household, owner, { displayName: 'lena', role: 'adult' }), 409, /already has this name/, 'displayName');
    throwsWith(() => members.addMember(household, owner, { displayName: '', role: 'adult' }), 400, /Enter a name/, 'displayName');
    throwsWith(() => members.addMember(household, owner, { displayName: 'Boss', role: 'owner' }), 400, /one owner/, 'role');

    const adult = members.addMember(household, owner, { displayName: 'Sandra', role: 'adult' });
    // Anyone who is not the owner is refused, whatever their role.
    for (const actor of [adult.id, lena.id]) {
      throwsWith(() => members.addMember(household, actor, { displayName: 'Intruder', role: 'adult' }), 403, /Only the household owner/);
      throwsWith(() => members.updateMember(household, actor, lena.id, { displayName: 'Hacked' }), 403, /Only the household owner/);
      throwsWith(() => members.updateMember(household, actor, actor, { role: 'adult' }), 403, /Only the household owner/);
      throwsWith(() => members.removeMember(household, actor, lena.id), 403, /Only the household owner/);
    }
    assert.equal(members.listMembers(household).find((member) => member.id === lena.id).display_name, 'Lena');

    // Rename and role change.
    assert.equal(members.updateMember(household, owner, lena.id, { displayName: 'Lena K.' }).display_name, 'Lena K.');
    assert.equal(members.updateMember(household, owner, lena.id, { role: 'viewer' }).role, 'viewer');
    throwsWith(() => members.updateMember(household, owner, lena.id, { role: 'owner' }), 400, /one owner/, 'role');
    throwsWith(() => members.updateMember(household, owner, owner, { role: 'adult' }), 400, /owner role cannot be changed/, 'role');
    throwsWith(() => members.updateMember(household, owner, lena.id, { displayName: 'sandra' }), 409, /already has this name/);
    assert.equal(members.updateMember(household, owner, owner, { displayName: 'Head of house' }).display_name, 'Head of house');
    throwsWith(() => members.updateMember(household, owner, 'nobody', { displayName: 'X' }), 404, /no longer exists/);

    // Profiles of another household are out of reach.
    const otherUser = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('other', 'hash').lastInsertRowid);
    const other = actions.ensureWorkspaceForUser(otherUser, 'other');
    throwsWith(() => members.updateMember(household, owner, other.member_id, { displayName: 'Stolen' }), 404, /no longer exists/);
    throwsWith(() => members.removeMember(other.id, owner, other.member_id), 403, /Only the household owner/);

    // Removal: protected profiles stay, others are deactivated and cleaned up.
    throwsWith(() => members.removeMember(household, owner, owner), 400, /owner profile cannot be removed/);
    const withLogin = actions.addHouseholdMember(household, 'Has Login', 'adult');
    const loginUser = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('haslogin', 'hash').lastInsertRowid);
    db.prepare('UPDATE household_members SET user_id = ? WHERE id = ?').run(loginUser, withLogin.id);
    assert.equal(members.listMembers(household).find((member) => member.id === withLogin.id).has_login, true);
    throwsWith(() => members.removeMember(household, owner, withLogin.id), 400, /sign-in/);

    actions.setPaperlessToken(household, lena.id, secretBox.encryptSecret('lena-token'), 9);
    const assigned = actions.createCase(household, owner, { paperlessDocumentId: 5, title: 'Renew passport', assigneeMemberId: lena.id });
    const removed = members.removeMember(household, owner, lena.id);
    assert.equal(removed.displayName, 'Lena K.');
    assert.equal(members.listMembers(household).some((member) => member.id === lena.id), false);
    const row = db.prepare('SELECT active, paperless_token_encrypted FROM household_members WHERE id = ?').get(lena.id);
    assert.equal(row.active, 0);
    assert.equal(row.paperless_token_encrypted, null, 'the removed profile keeps no Paperless token');
    assert.equal(actions.getCase(household, assigned.id).assigneeMemberId, null, 'open actions are unassigned, not lost');
    throwsWith(() => members.removeMember(household, owner, lena.id), 404, /no longer exists/);
    // The freed name can be used again.
    assert.equal(members.addMember(household, owner, { displayName: 'Lena K.', role: 'member' }).role, 'member');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, TAGVICO_DATA_DIR: dataDir, TAGVICO_AUTH_SECRET: 'x'.repeat(48) },
    encoding: 'utf8'
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a new profile without a role gets the least-privileged writer role, never one that approves', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-role-cwd-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-role-data-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tagvico-members-fixture', version: '3.5.0' }));
  const script = `
    const assert = require('node:assert/strict');
    const dist = ${JSON.stringify(path.join(root, 'dist'))};
    const documentModel = require(dist + '/models/document.js');
    const actions = require(dist + '/models/actionCenter.js');
    const members = require(dist + '/services/householdMembersService.js');
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const added = members.addMember(workspace.id, workspace.member_id, { displayName: 'Nina', role: undefined });
    assert.equal(added.role, 'member');
    assert.throws(() => actions.decideApproval(workspace.id, actions.createApproval(workspace.id, null, added.id, 'action.create', { paperlessDocumentId: 3, title: 'x' }).id, added.id, 'approved'), /cannot approve/);
    // Explicit roles and the owner keep their rights.
    assert.equal(members.addMember(workspace.id, workspace.member_id, { displayName: 'Ada', role: 'adult' }).role, 'adult');
    const listed = members.listMembers(workspace.id);
    assert.equal(listed.find((member) => member.id === workspace.member_id).role, 'owner');
    assert.equal(listed.find((member) => member.display_name === 'Ada').role, 'adult');
    documentModel.closeDatabase().then(() => process.exit(0));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, TAGVICO_DATA_DIR: dataDir, TAGVICO_AUTH_SECRET: 'x'.repeat(48) },
    encoding: 'utf8'
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('removal revokes channel access first and refuses when that fails, leaving the profile in place', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-channels-cwd-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-members-channels-data-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tagvico-members-fixture', version: '3.5.0' }));
  const script = `
    (async () => {
      const assert = require('node:assert/strict');
      const dist = ${JSON.stringify(path.join(root, 'dist'))};
      const documentModel = require(dist + '/models/document.js');
      const actions = require(dist + '/models/actionCenter.js');
      const members = require(dist + '/services/householdMembersService.js');
      const db = documentModel.getDatabase();
      const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
      const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
      const household = workspace.id;
      const owner = workspace.member_id;
      const lena = members.addMember(household, owner, { displayName: 'Lena', role: 'member' });
      const active = () => members.listMembers(household).some((member) => member.id === lena.id);

      // Channel revocation fails (for example the users setting is locked): nothing is removed.
      await assert.rejects(
        () => members.removeMemberAndChannelAccess(household, owner, lena.id, async () => { throw new Error('TELEGRAM_USERS is set in the environment'); }),
        (error) => error.status === 409 && /not removed/.test(error.message) && /TELEGRAM_USERS/.test(error.message)
      );
      assert.equal(active(), true, 'a failed allowlist change keeps the profile');

      // Refusals that do not depend on channels never touch the allowlists.
      let calls = [];
      const record = async (id) => { calls.push(id); };
      await assert.rejects(() => members.removeMemberAndChannelAccess(household, lena.id, lena.id, record), (error) => error.status === 403);
      await assert.rejects(() => members.removeMemberAndChannelAccess(household, owner, owner, record), (error) => error.status === 400);
      assert.deepEqual(calls, [], 'no allowlist is changed for a removal that is refused anyway');

      // Success: the allowlist is cleaned first, then the profile is removed.
      let activeWhenRevoked = null;
      const removed = await members.removeMemberAndChannelAccess(household, owner, lena.id, async (id) => { activeWhenRevoked = active(); calls.push(id); });
      assert.equal(removed.displayName, 'Lena');
      assert.equal(activeWhenRevoked, true, 'channel access is revoked before the database removal');
      assert.deepEqual(calls, [lena.id]);
      assert.equal(active(), false);
      await documentModel.closeDatabase();
    })().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, TAGVICO_DATA_DIR: dataDir, TAGVICO_AUTH_SECRET: 'x'.repeat(48) },
    encoding: 'utf8'
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
