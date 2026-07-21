const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const totp = require('../dist/services/totpService');
const { createRateLimiter } = require('../dist/services/rateLimiter');

test('TOTP accepts the current code and rejects malformed input', () => {
  const secret = totp.generateSecret();
  assert.equal(totp.verify(secret, totp.token(secret)), true);
  assert.equal(totp.verify(secret, '123'), false);
});

test('rate limiter returns 429 after the configured allowance', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const req = { ip: '127.0.0.1', socket: {} };
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalls = 0;
  limiter(req, response, () => { nextCalls += 1; });
  limiter(req, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, 429);
});

test('configured instances reject public setup mutations before processing credentials', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'routes', 'setup.ts'), 'utf8');
  const start = source.indexOf("router.post('/setup'");
  const handler = source.slice(start, start + 9000);

  assert.match(handler, /if \(await setupService\.isConfigured\(\)\)/);
  assert.match(handler, /res\.status\(409\)\.json/);
  assert.match(handler, /Setup has already been completed/);
  assert.ok(
    handler.indexOf('await setupService.isConfigured()') < handler.indexOf('initializeWithCredentials'),
    'configured instances must reject setup before validating or writing replacement credentials'
  );
});
