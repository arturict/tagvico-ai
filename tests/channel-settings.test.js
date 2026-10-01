const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// Synthetic Discord snowflakes, split so secret scanners do not mistake them for client IDs.
const HOME_CHANNEL_ID = '123456789' + '012345678';
const DISCORD_USER_ID = '123456789' + '012345679';

const root = path.resolve(__dirname, '..');

function runFixture(script) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-channels-cwd-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-channels-data-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tagvico-channels-fixture', version: '3.5.0' }));
  fs.writeFileSync(path.join(dataDir, '.env'), [
    'TAGVICO_AI_INITIAL_SETUP=yes',
    'PAPERLESS_API_URL=http://paperless.internal:8000/api',
    'PAPERLESS_API_TOKEN=installation-paperless-token'
  ].join('\n'));
  const environment = { ...process.env, TAGVICO_DATA_DIR: dataDir, TAGVICO_AUTH_SECRET: 'x'.repeat(48) };
  for (const key of Object.keys(environment)) {
    if (/^(TELEGRAM|DISCORD)_/.test(key)) delete environment[key];
  }
  const result = spawnSync(process.execPath, ['-e', script], { cwd, env: environment, encoding: 'utf8' });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  return result;
}

const preamble = `
  const assert = require('node:assert/strict');
  const dist = ${JSON.stringify(path.join(root, 'dist'))};
  const documentModel = require(dist + '/models/document.js');
  const actions = require(dist + '/models/actionCenter.js');
  const secretBox = require(dist + '/services/secretBox.js');
  const setupService = require(dist + '/services/setupService.js');
  const channels = require(dist + '/services/channelSettingsService.js');
  const status = require(dist + '/services/channelStatusService.js');
  const db = documentModel.getDatabase();
  const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
  const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
  const household = workspace.id;
  const sandra = actions.addHouseholdMember(household, 'Sandra', 'adult');
  const TOKEN = '123456789:' + 'A'.repeat(35);
`;

test('channel status follows the saved settings and only trusts reports for the current configuration', () => {
  const result = runFixture(preamble + `
    (async () => {
      assert.equal(status.channelStatus('telegram').state, 'off');

      let view = await channels.updateChannelSettings('telegram', household, { enabled: true });
      assert.equal(view.status.state, 'needs-setup');
      assert.equal(view.status.label, 'Add a bot token');

      view = await channels.updateChannelSettings('telegram', household, { botToken: TOKEN });
      assert.equal(view.tokenConfigured, true);
      assert.equal(view.status.label, 'Allow at least one person');

      view = await channels.updateChannelSettings('telegram', household, {
        allowed: [{ externalId: '1001', memberId: workspace.member_id }]
      });
      assert.equal(view.status.state, 'configured');
      assert.deepEqual(view.allowed, [{ externalId: '1001', memberId: workspace.member_id, memberName: 'owner' }]);

      status.reportChannel('telegram', { state: 'connected', label: 'Connected as @tagvico_bot' });
      let current = status.channelStatus('telegram');
      assert.equal(current.state, 'connected');
      assert.equal(current.label, 'Connected as @tagvico_bot');

      const later = Date.now() + status.CONNECTED_REPORT_MAX_AGE_MS + 1000;
      assert.equal(status.channelStatus('telegram', later).state, 'configured');

      await channels.updateChannelSettings('telegram', household, { remindersEnabled: false });
      assert.equal(status.channelStatus('telegram').state, 'configured', 'a changed setting needs a fresh confirmation');

      status.reportChannel('telegram', { state: 'error', label: 'Telegram rejected the bot token', detail: 'status code 401' });
      current = status.channelStatus('telegram');
      assert.equal(current.state, 'error');
      assert.equal(current.detail, 'status code 401');

      status.reportChannel('telegram', { state: 'connected', label: 'old run', fingerprint: 'not-the-current-one' });
      assert.equal(status.channelStatus('telegram').state, 'configured', 'a report from another configuration is ignored');

      const all = status.getChannelStatuses();
      assert.equal(all.discord.state, 'off');
      assert.deepEqual(Object.keys(all).sort(), ['discord', 'telegram']);

      await channels.updateChannelSettings('telegram', household, { enabled: false });
      assert.equal(status.channelStatus('telegram').state, 'off');
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('channel settings validate tokens and IDs, copy the right Paperless token and never return secrets', () => {
  const result = runFixture(preamble + `
    (async () => {
      const fails = async (promise, field, pattern) => {
        const error = await promise.then(() => null, (caught) => caught);
        assert.ok(error, 'expected a rejection');
        assert.equal(error.field, field);
        assert.equal(error.status, 400);
        assert.match(error.message, pattern);
      };

      await fails(channels.updateChannelSettings('telegram', household, { botToken: 'not a token' }), 'botToken', /@BotFather/);
      await fails(channels.updateChannelSettings('discord', household, { botToken: 'short' }), 'botToken', /Discord bot token/);
      await fails(channels.updateChannelSettings('discord', household, { homeChannelId: '12' }), 'homeChannelId', /17 to 20 digits/);
      await fails(channels.updateChannelSettings('telegram', household, { homeChannelId: '${HOME_CHANNEL_ID}' }), 'homeChannelId', /no home channel/);
      await fails(
        channels.updateChannelSettings('telegram', household, { allowed: [{ externalId: 'abc', memberId: workspace.member_id }] }),
        'allowed.0.externalId', /Telegram user ID/
      );
      await fails(
        channels.updateChannelSettings('discord', household, { allowed: [{ externalId: '12345', memberId: workspace.member_id }] }),
        'allowed.0.externalId', /Discord user ID/
      );
      await fails(
        channels.updateChannelSettings('telegram', household, { allowed: [
          { externalId: '1001', memberId: workspace.member_id }, { externalId: '1001', memberId: workspace.member_id }
        ] }),
        'allowed.1.externalId', /already in the list/
      );
      await fails(
        channels.updateChannelSettings('telegram', household, { allowed: [{ externalId: '1002', memberId: 'someone-else' }] }),
        'allowed.0.memberId', /household/
      );
      await fails(
        channels.updateChannelSettings('telegram', household, { allowed: [{ externalId: '1002', memberId: sandra.id }] }),
        'allowed.0.memberId', /Sandra needs a Paperless token first/
      );

      // The owner may use the installation token; Sandra acts with her own once she has one.
      actions.setPaperlessToken(household, sandra.id, secretBox.encryptSecret('sandra-paperless-token'), 7);
      await channels.updateChannelSettings('telegram', household, { botToken: TOKEN, allowed: [
        { externalId: '1001', memberId: workspace.member_id }, { externalId: '1002', memberId: sandra.id }
      ] });
      let saved = JSON.parse((await setupService.loadConfig()).TELEGRAM_USERS_JSON);
      assert.deepEqual(saved.map((entry) => [entry.telegramId, entry.paperlessToken, entry.householdId, entry.memberId]), [
        ['1001', 'installation-paperless-token', household, workspace.member_id],
        ['1002', 'sandra-paperless-token', household, sandra.id]
      ]);

      // The bots' own parser accepts exactly what was written.
      const telegram = require(dist + '/services/telegramBotService.js');
      const users = telegram.parseTelegramUsers((await setupService.loadConfig()).TELEGRAM_USERS_JSON, 'http://paperless.internal:8000/api');
      assert.equal(users.size, 2);
      assert.equal(users.get('1002').memberId, sandra.id);

      // Nothing the browser receives contains a secret.
      const view = channels.getChannelSettings('telegram', household);
      const serialized = JSON.stringify(view);
      for (const secret of [TOKEN, 'sandra-paperless-token', 'installation-paperless-token']) {
        assert.equal(serialized.includes(secret), false);
      }
      assert.deepEqual(view.members.map((member) => [member.name, member.credential]), [
        ['owner', 'installation'], ['Sandra', 'profile']
      ]);

      // Discord uses snowflakes and a home channel.
      await channels.updateChannelSettings('discord', household, {
        enabled: true,
        botToken: 'D'.repeat(24) + '.' + 'e'.repeat(6) + '.' + 'f'.repeat(27),
        homeChannelId: '${HOME_CHANNEL_ID}',
        allowed: [{ externalId: '${DISCORD_USER_ID}', memberId: workspace.member_id }]
      });
      const discord = channels.getChannelSettings('discord', household);
      assert.equal(discord.homeChannelId, '${HOME_CHANNEL_ID}');
      assert.equal(discord.status.state, 'configured');
      assert.equal(JSON.parse((await setupService.loadConfig()).DISCORD_USERS_JSON)[0].discordId, '${DISCORD_USER_ID}');

      // Removing the token turns the channel back into "needs setup".
      await channels.updateChannelSettings('discord', household, { clearToken: true });
      assert.equal(channels.getChannelSettings('discord', household).status.state, 'needs-setup');
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('a profile token change or removal reaches the allowlists', () => {
  const result = runFixture(preamble + `
    (async () => {
      actions.setPaperlessToken(household, sandra.id, secretBox.encryptSecret('first-token'), 7);
      await channels.updateChannelSettings('telegram', household, { botToken: TOKEN, allowed: [
        { externalId: '2002', memberId: sandra.id }
      ] });
      const tokenOf = async () => JSON.parse((await setupService.loadConfig()).TELEGRAM_USERS_JSON).map((entry) => entry.paperlessToken);
      assert.deepEqual(await tokenOf(), ['first-token']);

      actions.setPaperlessToken(household, sandra.id, secretBox.encryptSecret('second-token'));
      await channels.refreshMemberCredentials(household, sandra.id);
      assert.deepEqual(await tokenOf(), ['second-token']);

      actions.setPaperlessToken(household, sandra.id, null);
      await channels.refreshMemberCredentials(household, sandra.id);
      assert.deepEqual(await tokenOf(), [], 'without a token the person can no longer act');

      actions.setPaperlessToken(household, sandra.id, secretBox.encryptSecret('third-token'));
      await channels.updateChannelSettings('discord', household, { allowed: [{ externalId: '${DISCORD_USER_ID}', memberId: sandra.id }] });
      await channels.removeMemberFromChannels(household, sandra.id);
      assert.deepEqual(JSON.parse((await setupService.loadConfig()).DISCORD_USERS_JSON), []);
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('entries configured outside Settings survive an allowlist edit', () => {
  const result = runFixture(preamble + `
    (async () => {
      await setupService.savePartialConfig({
        TELEGRAM_USERS_JSON: JSON.stringify([{ telegramId: '555', paperlessToken: 'custom-token', paperlessUrl: 'http://other:8000/api' }])
      });
      const before = channels.getChannelSettings('telegram', household);
      assert.deepEqual(before.allowed, [{ externalId: '555', memberId: '', memberName: '' }]);
      await channels.updateChannelSettings('telegram', household, {
        allowed: [...before.allowed.map(({ externalId, memberId }) => ({ externalId, memberId })), { externalId: '1001', memberId: workspace.member_id }]
      });
      const saved = JSON.parse((await setupService.loadConfig()).TELEGRAM_USERS_JSON);
      assert.equal(saved[0].paperlessToken, 'custom-token');
      assert.equal(saved[0].paperlessUrl, 'http://other:8000/api');
      assert.equal(saved.length, 2);
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('testing a bot token reports acceptance, rejection and unreachable platforms without sending messages', () => {
  const result = runFixture(preamble + `
    (async () => {
      const axios = require(${JSON.stringify(path.join(root, 'node_modules/axios'))});
      await assert.rejects(channels.testChannel('telegram'), /Save a bot token first/);
      await channels.updateChannelSettings('telegram', household, { botToken: TOKEN });

      const calls = [];
      axios.get = async (url) => { calls.push(url); return { data: { ok: true, result: { username: 'tagvico_bot' } } }; };
      assert.match((await channels.testChannel('telegram')).label, /@tagvico_bot/);
      assert.ok(calls[0].endsWith('/getMe'), 'only a read-only call is made');

      axios.get = async () => { throw Object.assign(new Error('401'), { isAxiosError: true, response: { status: 401 } }); };
      await assert.rejects(channels.testChannel('telegram'), (error) => error.field === 'botToken' && /rejected this bot token/.test(error.message) && !error.message.includes(TOKEN));

      axios.get = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { isAxiosError: true }); };
      await assert.rejects(channels.testChannel('telegram'), /Could not reach Telegram/);
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('the bots restart only when a setting they depend on changes', () => {
  const result = runFixture(preamble + `
    (async () => {
      const telegram = require(dist + '/services/telegramBotService.js');
      const discord = require(dist + '/services/discordBotService.js');
      for (const [name, service, channel] of [['telegram', telegram, 'telegram'], ['discord', discord, 'discord']]) {
        const events = [];
        service.stop = async () => { events.push('stop'); };
        service.start = () => { events.push('start'); service.appliedFingerprint = status.readChannelConfiguration(channel).fingerprint; };
        service.appliedFingerprint = status.readChannelConfiguration(channel).fingerprint;
        await service.reconfigure();
        assert.deepEqual(events, [], name + ': nothing changed');
        await setupService.savePartialConfig({ [channel.toUpperCase() + '_BOT_ENABLED']: 'yes' });
        await service.reconfigure();
        assert.deepEqual(events, ['stop', 'start'], name + ': enabling restarts the bot');
        await setupService.savePartialConfig({ MAX_TAGS_UNRELATED: '3' });
        await service.reconfigure();
        assert.deepEqual(events, ['stop', 'start'], name + ': unrelated settings leave the bot alone');
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('saved settings reach the running backend: the Paperless client is reset and listeners are told', () => {
  const result = runFixture(preamble + `
    (async () => {
      const sync = require(dist + '/services/settingsRuntimeSync.js');
      const paperless = require(dist + '/services/paperlessService.js');
      const config = require(dist + '/config/config.js');
      let resets = 0;
      const originalReset = paperless.reset.bind(paperless);
      paperless.reset = () => { resets += 1; originalReset(); };
      let notified = 0;
      const stop = sync.onSettingsChange(() => { notified += 1; });

      await sync.reconcile();
      assert.equal(notified, 1);
      assert.equal(resets, 0, 'unchanged Paperless settings keep the client');

      await setupService.savePartialConfig({ PAPERLESS_API_URL: 'http://other-paperless:8000/api', PAPERLESS_API_TOKEN: 'rotated-token' });
      await sync.reconcile();
      assert.equal(notified, 2);
      assert.equal(resets, 1, 'a changed address or token drops the cached client');
      assert.equal(config.paperless.apiUrl, 'http://other-paperless:8000/api');

      await setupService.savePartialConfig({ SCAN_INTERVAL: '*/5 * * * *' });
      await sync.reconcile();
      assert.equal(resets, 1, 'unrelated settings leave the client alone');
      stop();
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.status, 0, result.stderr);
});
