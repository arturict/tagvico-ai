const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

// Compiles a plain TypeScript module the way the web build does; `@/components/inbox/dates` resolves to the real file.
function load(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  const localRequire = (specifier) => specifier === '@/components/inbox/dates' ? load('src/components/inbox/dates.ts') : require(specifier);
  new Function('module', 'exports', 'require', outputText)(module, module.exports, localRequire);
  return module.exports;
}

const session = (id, updatedAt, messageCount = 2, title = id) => ({ id, title, updated_at: updatedAt, message_count: messageCount });

test('sidebar history groups chats by Zurich calendar day, newest first', () => {
  const { groupSessions } = load('src/components/shell/chat-sessions.ts');
  // 10:00 UTC on 1 Oct 2026 is noon in Zurich.
  const now = new Date('2026-10-01T10:00:00Z');
  const groups = groupSessions([
    session('this-morning', '2026-10-01 05:00:00'),
    // 22:30 UTC on 30 Sep is half past midnight on 1 Oct in Zurich, so it still counts as today.
    session('after-midnight', '2026-09-30 22:30:00'),
    session('yesterday', '2026-09-30 12:00:00'),
    session('three-days', '2026-09-28 12:00:00'),
    session('seven-days', '2026-09-24 12:00:00'),
    session('eight-days', '2026-09-23 12:00:00'),
    session('unreadable', 'not a date')
  ], now);
  assert.deepEqual(groups.map((group) => [group.label, group.sessions.map((entry) => entry.id)]), [
    ['Today', ['this-morning', 'after-midnight']],
    ['Yesterday', ['yesterday']],
    ['Previous 7 days', ['three-days', 'seven-days']],
    ['Older', ['eight-days', 'unreadable']]
  ]);
  assert.deepEqual(groupSessions([], now), []);
  assert.deepEqual(groupSessions([session('only-old', '2026-01-01 08:00:00')], now).map((group) => group.label), ['Older']);
});

test('sidebar history lists chats with messages and the open chat, and names empty ones New chat', () => {
  const { listedSessions, chatTitle, parseSessions } = load('src/components/shell/chat-sessions.ts');
  const sessions = [session('full', '2026-10-01 05:00:00', 3), session('empty-open', '2026-10-01 05:00:00', 0), session('empty-other', '2026-10-01 05:00:00', 0)];
  assert.deepEqual(listedSessions(sessions, 'empty-open').map((entry) => entry.id), ['full', 'empty-open']);
  assert.deepEqual(listedSessions(sessions, '').map((entry) => entry.id), ['full']);
  assert.equal(chatTitle({ title: 'New conversation' }), 'New chat');
  assert.equal(chatTitle({ title: '  ' }), 'New chat');
  assert.equal(chatTitle({ title: 'Tax 2025' }), 'Tax 2025');
  // The API row carries more than the sidebar needs; anything that is not a session is dropped.
  assert.deepEqual(parseSessions([{ id: 'a', title: 'A', channel: 'web', updated_at: '2026-10-01 05:00:00', message_count: '4', preview: 'x' }, null, { title: 'no id' }, 'text']),
    [{ id: 'a', title: 'A', updated_at: '2026-10-01 05:00:00', message_count: 4 }]);
  assert.deepEqual(parseSessions({ sessions: [] }), []);
});

test('the chat page and the sidebar share one event name for "chats changed"', () => {
  const { SESSIONS_CHANGED_EVENT } = load('src/components/shell/chat-sessions.ts');
  assert.equal(SESSIONS_CHANGED_EVENT, 'tagvico:sessions-changed');
});

test('mobile top bar titles follow the page', () => {
  const { pageTitle, isCurrent } = load('src/components/shell/routes.ts');
  const members = [{ id: 'm1', displayName: 'Sandra' }];
  assert.equal(pageTitle('/companion', members), 'Tagvico');
  assert.equal(pageTitle('/inbox', members), 'Needs you');
  assert.equal(pageTitle('/settings/channels', members), 'Settings');
  assert.equal(pageTitle('/people/m1', members), 'Sandra');
  assert.equal(pageTitle('/people/unknown', members), 'People');
  assert.equal(pageTitle('/inboxes', members), 'Tagvico');
  assert.equal(isCurrent('/documents/12', '/documents'), true);
  assert.equal(isCurrent('/documents-old', '/documents'), false);
});

test('the shell keeps publishing both bar heights for pages that fill the space between them', () => {
  const css = read('src/app/styles/shell.css');
  const chat = read('src/app/styles/chat.css');
  assert.match(css, /--shell-top-bar:\s*48px/);
  assert.match(css, /--shell-bottom-bar:\s*0px/);
  assert.match(chat, /var\(--shell-top-bar/);
  assert.match(chat, /var\(--shell-bottom-bar/);
});

test('the account menu opens Paperless in a new tab without leaking the opener', () => {
  const menu = read('src/components/shell/user-menu.tsx');
  assert.match(menu, /href=\{paperlessUrl\} target="_blank" rel="noopener noreferrer"/);
});
