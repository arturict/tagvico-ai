const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const telegramBot = require('../dist/services/telegramBotService');
const { telegramPaperlessInternals } = require('../dist/services/telegramPaperlessClient');
const config = require('../dist/config/config');

const allowedUser = {
  telegramId: '123',
  paperlessToken: 'alice-token',
  paperlessUrl: 'http://paperless:8000/api'
};

function serviceWithAllowedUser() {
  const service = new telegramBot.TelegramBotService();
  service.users = new Map([[allowedUser.telegramId, allowedUser]]);
  return service;
}

test('Telegram allowlist accepts arrays and isolates each Paperless token', () => {
  const users = telegramBot.parseTelegramUsers(JSON.stringify([
    { telegramId: '123', paperlessToken: 'alice-token' },
    { telegram_id: 456, paperless_token: 'bob-token', paperless_url: 'https://paperless.example' },
    { telegramId: 'not-an-id', paperlessToken: 'ignored' }
  ]), 'http://paperless:8000/api');

  assert.equal(users.size, 2);
  assert.deepEqual(users.get('123'), {
    telegramId: '123',
    paperlessToken: 'alice-token',
    paperlessUrl: 'http://paperless:8000/api'
  });
  assert.equal(users.get('456').paperlessToken, 'bob-token');
  assert.equal(users.get('456').paperlessUrl, 'https://paperless.example');
});

test('Telegram allowlist also accepts an id-to-token object', () => {
  const users = telegramBot.parseTelegramUsers('{"789":"token-789"}', 'https://paperless.example/api');
  assert.equal(users.get('789').paperlessToken, 'token-789');
});

test('answer citations only expose documents returned by the current search', () => {
  const documents = [{ id: 10 }, { id: 11 }];
  const ids = telegramBot.internals.extractDocumentIds('Use [doc:10], ignore [doc:99], and repeat [doc:10].', documents);
  assert.deepEqual(ids, [10]);
  assert.equal(
    telegramBot.internals.cleanAnswerCitations('Found it [doc:10].'),
    'Found it (document 10).'
  );
});

test('Telegram messages are split below the API text limit', () => {
  const chunks = telegramBot.internals.chunkTelegramText('word '.repeat(2500));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 4000));
});

test('Paperless task parsing recognizes duplicate document links', () => {
  assert.equal(
    telegramPaperlessInternals.relatedDocumentId({
      status: 'FAILURE',
      result: 'Duplicate detected: document 42 already exists.'
    }),
    42
  );
  assert.equal(
    telegramPaperlessInternals.relatedDocumentId({ related_document: { id: 77 } }),
    77
  );
  assert.equal(
    telegramPaperlessInternals.relatedDocumentId({ status: 'SUCCESS', result: 'New document id 88 created successfully.' }),
    88
  );
});

test('Paperless URLs are normalized to one API suffix', () => {
  assert.equal(telegramPaperlessInternals.normalizeApiUrl('https://paperless.example/'), 'https://paperless.example/api');
  assert.equal(telegramPaperlessInternals.normalizeApiUrl('https://paperless.example/api/'), 'https://paperless.example/api');
});

test('Telegram routing ignores groups and unknown IDs, then selects the allowlisted user', async () => {
  const service = serviceWithAllowedUser();
  const routed = [];
  service.handleQuestion = async (message, user) => routed.push({ message, user });

  await service.handleUpdate({
    update_id: 1,
    message: { message_id: 1, from: { id: 123 }, chat: { id: -1, type: 'group' }, text: 'private data?' }
  });
  await service.handleUpdate({
    update_id: 2,
    message: { message_id: 2, from: { id: 999 }, chat: { id: 999, type: 'private' }, text: 'private data?' }
  });
  assert.equal(routed.length, 0);

  const message = { message_id: 3, from: { id: 123 }, chat: { id: 123, type: 'private' }, text: 'my invoices' };
  await service.handleUpdate({ update_id: 3, message });
  assert.deepEqual(routed, [{ message, user: allowedUser }]);
  assert.equal(routed[0].user.paperlessToken, 'alice-token');
});

test('download callbacks use the requesting user Paperless client and return the original', async () => {
  const service = serviceWithAllowedUser();
  const calls = [];
  let selectedUser;
  service.call = async (method, body) => calls.push({ method, body });
  service.paperlessFor = (user) => {
    selectedUser = user;
    return {
      downloadDocument: async (id) => ({
        buffer: Buffer.from(`document-${id}`),
        filename: 'invoice.pdf',
        mimeType: 'application/pdf'
      })
    };
  };
  let sent;
  service.sendDocument = async (...args) => { sent = args; };

  await service.handleCallback({
    id: 'callback-1',
    from: { id: 123 },
    data: 'doc:42',
    message: { message_id: 4, chat: { id: 123, type: 'private' } }
  });

  assert.equal(selectedUser.paperlessToken, 'alice-token');
  assert.deepEqual(calls.map(({ method }) => method), ['answerCallbackQuery', 'sendChatAction']);
  assert.equal(sent[0], 123);
  assert.equal(sent[1].toString(), 'document-42');
  assert.equal(sent[2], 'invoice.pdf');
});

test('Telegram upload waits for Paperless and links the existing document on duplicates', async () => {
  const service = serviceWithAllowedUser();
  const originalAxiosGet = axios.get;
  const messages = [];
  let uploaded;
  try {
    axios.get = async () => ({ data: Buffer.from('pdf'), headers: { 'content-type': 'application/pdf' } });
    service.call = async (method) => method === 'getFile'
      ? { file_path: 'documents/invoice.pdf', file_size: 3 }
      : undefined;
    service.sendText = async (...args) => messages.push(args);
    service.paperlessFor = (user) => ({
      uploadDocument: async (buffer, filename, mimeType) => {
        uploaded = { user, buffer, filename, mimeType };
        return 'task-1';
      },
      waitForConsumption: async (taskId) => {
        assert.equal(taskId, 'task-1');
        return { documentId: 77, duplicate: true, task: { status: 'FAILURE' } };
      }
    });

    await service.handleUpload({
      message_id: 5,
      from: { id: 123 },
      chat: { id: 123, type: 'private' },
      document: { file_id: 'telegram-file', file_name: 'invoice.pdf', mime_type: 'application/pdf', file_size: 3 }
    }, allowedUser);
  } finally {
    axios.get = originalAxiosGet;
  }

  assert.equal(uploaded.user.paperlessToken, 'alice-token');
  assert.equal(uploaded.buffer.toString(), 'pdf');
  assert.equal(uploaded.filename, 'invoice.pdf');
  assert.equal(messages.at(-1)[1], 'Paperless detected a duplicate. I kept the existing document.');
  assert.deepEqual(messages.at(-1)[2], [{ id: 77, title: 'Existing document' }]);
});

test('successful uploads do not classify unless automatic metadata is explicitly enabled', async () => {
  const service = serviceWithAllowedUser();
  const originalAxiosGet = axios.get;
  const originalAutomaticMetadata = config.telegram.automaticUploadMetadata;
  const messages = [];
  let classified = false;
  try {
    config.telegram.automaticUploadMetadata = 'no';
    axios.get = async () => ({ data: Buffer.from('photo'), headers: { 'content-type': 'image/jpeg' } });
    service.call = async (method) => method === 'getFile' ? { file_path: 'photos/photo.jpg' } : undefined;
    service.sendText = async (...args) => messages.push(args);
    service.classifyUpload = async () => {
      classified = true;
      return 'classified';
    };
    service.paperlessFor = () => ({
      uploadDocument: async () => 'task-2',
      waitForConsumption: async () => ({ documentId: 88, duplicate: false, task: { status: 'SUCCESS' } })
    });

    await service.handleUpload({
      message_id: 6,
      from: { id: 123 },
      chat: { id: 123, type: 'private' },
      photo: [{ file_id: 'photo-small' }, { file_id: 'photo-large' }]
    }, allowedUser);
  } finally {
    axios.get = originalAxiosGet;
    config.telegram.automaticUploadMetadata = originalAutomaticMetadata;
  }

  assert.equal(classified, false);
  assert.match(messages.at(-1)[1], /Automatic Telegram metadata is off/);
  assert.deepEqual(messages.at(-1)[2], [{ id: 88, title: 'telegram-photo-6.jpg' }]);
});

test('successful uploads classify only after the automatic metadata opt-in is enabled', async () => {
  const service = serviceWithAllowedUser();
  const originalAxiosGet = axios.get;
  const originalAutomaticMetadata = config.telegram.automaticUploadMetadata;
  const messages = [];
  try {
    config.telegram.automaticUploadMetadata = 'yes';
    axios.get = async () => ({ data: Buffer.from('pdf'), headers: { 'content-type': 'application/pdf' } });
    service.call = async (method) => method === 'getFile' ? { file_path: 'documents/new.pdf' } : undefined;
    service.sendText = async (...args) => messages.push(args);
    service.classifyUpload = async (paperless, documentId) => {
      assert.equal(paperless.kind, 'per-user-client');
      assert.equal(documentId, 89);
      return 'classified after opt-in';
    };
    service.paperlessFor = () => ({
      kind: 'per-user-client',
      uploadDocument: async () => 'task-3',
      waitForConsumption: async () => ({ documentId: 89, duplicate: false, task: { status: 'SUCCESS' } })
    });

    await service.handleUpload({
      message_id: 7,
      from: { id: 123 },
      chat: { id: 123, type: 'private' },
      document: { file_id: 'new-file', file_name: 'new.pdf', mime_type: 'application/pdf' }
    }, allowedUser);
  } finally {
    axios.get = originalAxiosGet;
    config.telegram.automaticUploadMetadata = originalAutomaticMetadata;
  }

  assert.equal(messages.at(-1)[1], 'classified after opt-in');
  assert.deepEqual(messages.at(-1)[2], [{ id: 89, title: 'new.pdf' }]);
});

test('Compose passes every Telegram setting through with automatic metadata off by default', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  const expected = {
    TELEGRAM_BOT_ENABLED: 'no',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_USERS_JSON: '[]',
    TELEGRAM_POLL_TIMEOUT_SECONDS: '30',
    TELEGRAM_UPLOAD_TIMEOUT_SECONDS: '180',
    TELEGRAM_MAX_DOCUMENTS: '8',
    TELEGRAM_HISTORY_TURNS: '6',
    TELEGRAM_MAX_FILE_BYTES: '20971520',
    TELEGRAM_UPLOAD_AUTOMATIC_METADATA: 'no'
  };
  for (const [name, fallback] of Object.entries(expected)) {
    assert.match(compose, new RegExp(`${name}: \\${'${'}${name}:-${fallback.replace(/[\\[\]]/g, '\\$&')}\\}`));
  }
});
