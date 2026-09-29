const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const authModule = require('../dist/services/chatgptPlanAuthService');
const planModule = require('../dist/services/chatgptPlanService');
const { resolveDataDirectory } = require('../dist/services/dataDirectory');
const providerRegistry = require('../dist/services/providerRegistry');

const auth = authModule.default;
const CLIENT_ID = 'oaiapp_test123';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

function idToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://auth.openai.com', aud: CLIENT_ID, sub: 'user-1', email: 'reader@example.com',
    iat: now, exp: now + 3600, ...claims
  })).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function sse(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

const calls = [];
let nonce = '';
let tokenResponses = [];
let responsesReply = () => sse([]);
const originalFetch = global.fetch;

test.before(() => {
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, headers: init.headers || {} });
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/oauth/token')) return Response.json(tokenResponses.shift());
    if (url.endsWith('/oauth/revoke')) return new Response('', { status: 200 });
    if (url.endsWith('/v1/models')) {
      return Response.json({ models: [
        { slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list' },
        { slug: 'internal-model', display_name: 'Hidden', visibility: 'hide' }
      ] });
    }
    if (url.endsWith('/v1/responses')) return responsesReply(body);
    throw new Error(`unexpected fetch ${url}`);
  };
  fs.rmSync(path.join(resolveDataDirectory(), 'chatgpt'), { recursive: true, force: true });
});

test.after(() => {
  global.fetch = originalFetch;
});

test('first sign-in registers Tagvico dynamically with plan-usage scopes and a stable host ID', () => {
  const login = auth.startLogin();
  const url = new URL(login.authorizeUrl);
  assert.equal(url.origin + url.pathname, 'https://auth.openai.com/api/accounts/authorize');
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('agent_name_hint'), 'Tagvico');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:1455/auth/callback');
  assert.equal(url.searchParams.get('resource'), 'https://api.openai.com/v1');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(),
    ['chatgpt.tokens.use.direct', 'email', 'offline_access', 'openid', 'profile', 'resource.invoke']);
  assert.match(url.searchParams.get('ext_agent_host_id'), /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(authModule.hostId(), url.searchParams.get('ext_agent_host_id'));
  auth.cancelLogin(login.loginId);
});

test('callback parsing rejects foreign state, declined consent and an unissued client', () => {
  const ok = authModule.parseCallback(`http://127.0.0.1:1455/auth/callback?code=abc&state=s1&client_id=${CLIENT_ID}`, 's1', null);
  assert.deepEqual(ok, { code: 'abc', clientId: CLIENT_ID });
  assert.deepEqual(authModule.parseCallback('?code=abc&state=s1', 's1', CLIENT_ID), { code: 'abc', clientId: CLIENT_ID });
  assert.throws(() => authModule.parseCallback('?code=abc&state=other&client_id=x', 's1', null), /different sign-in attempt/);
  assert.throws(() => authModule.parseCallback('?error=access_denied&state=s1', 's1', null), /not allowed/);
  assert.throws(() => authModule.parseCallback('?code=abc&state=s1&client_id=dynamic_agent_client', 's1', null), /did not finish registering/);
  assert.throws(() => authModule.parseCallback('?code=abc&state=s1&client_id=oaiapp_other', 's1', CLIENT_ID), /did not finish registering/);
});

test('ID tokens must be signed by OpenAI for this client and carry the sign-in nonce', async () => {
  const resolveKey = async () => publicKey;
  const identity = await authModule.verifyIdToken(idToken({ nonce: 'n1' }), CLIENT_ID, 'n1', resolveKey);
  assert.deepEqual(identity, { subject: 'user-1', email: 'reader@example.com', name: null });
  await assert.rejects(authModule.verifyIdToken(idToken({ nonce: 'n2' }), CLIENT_ID, 'n1', resolveKey), /could not be verified/);
  await assert.rejects(authModule.verifyIdToken(idToken({ aud: 'oaiapp_other' }), CLIENT_ID, undefined, resolveKey), /could not be verified/);
  await assert.rejects(authModule.verifyIdToken(idToken({ exp: 1 }), CLIENT_ID, undefined, resolveKey), /could not be verified/);
  const forged = idToken({}).split('.');
  forged[1] = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: CLIENT_ID, sub: 'admin', iat: 1, exp: 9999999999 })).toString('base64url');
  await assert.rejects(authModule.verifyIdToken(forged.join('.'), CLIENT_ID, undefined, resolveKey), /could not be verified/);
});

test('completing sign-in exchanges the code with PKCE and stores owner-only credentials', async () => {
  const login = auth.startLogin();
  const url = new URL(login.authorizeUrl);
  nonce = url.searchParams.get('nonce');
  tokenResponses.push({
    access_token: 'access-1', refresh_token: 'refresh-1', id_token: idToken({ nonce }), token_type: 'Bearer',
    expires_in: 3600, scope: 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke'
  });
  const status = await auth.completeLogin(
    login.loginId,
    `http://127.0.0.1:1455/auth/callback?code=code-1&state=${url.searchParams.get('state')}&client_id=${CLIENT_ID}`
  );
  assert.equal(status.authenticated, true);
  assert.equal(status.planUsage, true);
  assert.equal(status.account.email, 'reader@example.com');

  const exchange = calls.find((call) => call.url.endsWith('/oauth/token'));
  assert.equal(exchange.body.grant_type, 'authorization_code');
  assert.equal(exchange.body.client_id, CLIENT_ID);
  assert.equal(exchange.body.resource, 'https://api.openai.com/v1');
  const challenge = crypto.createHash('sha256').update(exchange.body.code_verifier).digest('base64url');
  assert.equal(challenge, url.searchParams.get('code_challenge'));

  const file = path.join(resolveDataDirectory(), 'chatgpt', 'auth.json');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  await assert.rejects(auth.completeLogin(login.loginId, 'http://127.0.0.1:1455/auth/callback?code=x'), /expired/);
});

test('a returning sign-in reuses the issued client instead of registering again', () => {
  const login = auth.startLogin();
  const url = new URL(login.authorizeUrl);
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('agent_name_hint'), null);
  assert.equal(url.searchParams.get('login_hint'), 'reader@example.com');
  assert.equal(url.searchParams.get('id_token_hint'), null);
  auth.cancelLogin(login.loginId);
});

test('filing requests follow the plan-usage Responses contract and read the stream to completion', async () => {
  let sent;
  responsesReply = (body) => {
    sent = body;
    return sse([
      { type: 'response.output_text.delta', delta: '{"title":"Rechnung August",' },
      { type: 'response.output_text.delta', delta: '"correspondent":"Swisscom","tags":["Rechnung"],"document_type":"Invoice","document_date":"2026-08-04","language":"de","owner":null,"custom_fields":{},"confidence":{"title":0.9,"correspondent":0.95,"tags":0.9,"document_type":0.9,"custom_fields":1,"owner":1}}' },
      { type: 'response.completed', response: { usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160 } } }
    ]);
  };
  const result = await planModule.default.analyzeDocument('Swisscom Rechnung', ['Rechnung'], ['Swisscom'], ['Invoice']);
  assert.equal(result.error, undefined);
  assert.equal(result.document.correspondent, 'Swisscom');
  assert.deepEqual(result.metrics, { promptTokens: 120, completionTokens: 40, totalTokens: 160 });
  assert.equal(sent.store, false);
  assert.equal(sent.stream, true);
  assert.equal(sent.text.format.type, 'json_schema');
  for (const field of ['temperature', 'max_output_tokens', 'previous_response_id', 'metadata', 'user']) assert.equal(field in sent, false);
  assert.ok(sent.instructions.length > 0);
  assert.ok(sent.input.every((item) => item.role !== 'system'));
  const request = calls.findLast((call) => call.url.endsWith('/v1/responses'));
  assert.equal(request.headers.Authorization, 'Bearer access-1');
});

test('a usage limit stops the request with a pointer to ChatGPT usage settings', async () => {
  responsesReply = () => sse([
    { type: 'response.output_text.delta', delta: 'partial' },
    { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } } }
  ]);
  await assert.rejects(planModule.default.generateText('hi'), /usage limit.*chatgpt\.com\/settings\/usage/);
  responsesReply = () => new Response(': keep-alive\n\ndata: {"type":"response.output_text.delta","delta":"x"}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' }
  });
  await assert.rejects(planModule.default.generateText('hi'), /ended before it completed/);
});

test('model discovery lists only models the plan marks for display', async () => {
  assert.deepEqual(await planModule.default.listModels(), [{ id: 'gpt-6-luna', name: 'GPT-6 Luna', isDefault: true }]);
});

test('an expiring access token is refreshed once and the rotated refresh token is kept', async () => {
  const file = path.join(resolveDataDirectory(), 'chatgpt', 'auth.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...stored, expiresAt: Date.now() + 1000 }), { mode: 0o600 });
  tokenResponses.push({ access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'Bearer', expires_in: 3600 });
  assert.equal(await auth.accessToken(), 'access-2');
  const refresh = calls.findLast((call) => call.url.endsWith('/oauth/token'));
  assert.deepEqual(
    { grant: refresh.body.grant_type, client: refresh.body.client_id, token: refresh.body.refresh_token, scope: refresh.body.scope },
    { grant: 'refresh_token', client: CLIENT_ID, token: 'refresh-1', scope: undefined }
  );
  const rotated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(rotated.refreshToken, 'refresh-2');
  assert.ok(rotated.scopes.includes('chatgpt.tokens.use.direct'));
  assert.equal(await auth.accessToken(), 'access-2');
});

test('a renewed identity that fails verification is never used', async () => {
  const file = path.join(resolveDataDirectory(), 'chatgpt', 'auth.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...stored, expiresAt: Date.now() + 1000 }), { mode: 0o600 });
  const forged = idToken({}).split('.');
  forged[2] = forged[2].split('').reverse().join('');
  tokenResponses.push({ access_token: 'access-unverified', refresh_token: 'refresh-unverified', id_token: forged.join('.'), token_type: 'Bearer', expires_in: 3600 });
  await assert.rejects(auth.accessToken(), /could not be verified/);
  await assert.rejects(auth.accessToken(), /Sign in with ChatGPT/);
  assert.equal(auth.status().authenticated, false);
  fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
});

test('a refresh that was in flight cannot undo a sign-out', async () => {
  const file = path.join(resolveDataDirectory(), 'chatgpt', 'auth.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...stored, expiresAt: Date.now() + 1000 }), { mode: 0o600 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const previousFetch = global.fetch;
  global.fetch = async (input, init) => {
    if (String(input).endsWith('/oauth/token')) {
      await gate;
      return Response.json({ access_token: 'access-late', refresh_token: 'refresh-late', token_type: 'Bearer', expires_in: 3600 });
    }
    return previousFetch(input, init);
  };
  try {
    const refreshing = auth.accessToken();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const signingOut = auth.logout();
    release();
    assert.equal(await refreshing, 'access-late');
    await signingOut;
    const revoke = calls.findLast((call) => call.url.endsWith('/oauth/revoke'));
    assert.equal(revoke.body.token, 'refresh-late');
    assert.equal(auth.status().authenticated, false);
    await assert.rejects(auth.accessToken(), /Sign in with ChatGPT/);
  } finally {
    global.fetch = previousFetch;
    fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
  }
});

test('a declined plan permission is requested again with explicit consent', () => {
  const file = path.join(resolveDataDirectory(), 'chatgpt', 'auth.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...stored, scopes: ['openid', 'email', 'profile', 'offline_access'] }), { mode: 0o600 });
  const login = auth.startLogin();
  assert.equal(new URL(login.authorizeUrl).searchParams.get('prompt'), 'consent');
  auth.cancelLogin(login.loginId);
  fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
});

test('stream events survive a CRLF split across network chunks', async () => {
  const encoder = new TextEncoder();
  const parts = ['data: {"type":"response.output_text.delta",\r', '\ndata: "delta":"ok"}\r\n\r\n', 'data: {"type":"response.completed","response":{}}\r\n\r\n'];
  const body = new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(encoder.encode(part)); controller.close(); } });
  assert.equal((await planModule.readResponseStream(body)).text, 'ok');
});

test('signing out revokes the refresh token and keeps the registration for later', async () => {
  const result = await auth.logout();
  assert.deepEqual(result, { success: true, revoked: true });
  const revoke = calls.findLast((call) => call.url.endsWith('/oauth/revoke'));
  assert.deepEqual(revoke.body, { token: 'refresh-2', token_type_hint: 'refresh_token', client_id: CLIENT_ID });
  assert.equal(auth.status().authenticated, false);
  await assert.rejects(auth.accessToken(), /Sign in with ChatGPT/);
  assert.equal(new URL(auth.startLogin().authorizeUrl).searchParams.get('client_id'), CLIENT_ID);
});

test('the registry offers the ChatGPT plan for filing, the Companion and TypeSafe titles', () => {
  const registry = providerRegistry.default || providerRegistry;
  const definition = registry.getProviderDefinition('chatgpt');
  assert.equal(definition.runtimeAdapter, 'chatgpt-plan');
  assert.equal(definition.discovery, 'chatgpt');
  assert.equal(definition.manualModelInput, false);
  const typesafe = registry.getProviderDefinition('typesafe');
  assert.equal(typesafe.configurationSchema.shape.textProvider.parse('chatgpt'), 'chatgpt');
  const { textProviderIds } = require('../dist/services/textGenerationService');
  assert.ok(textProviderIds().includes('chatgpt'));
});
