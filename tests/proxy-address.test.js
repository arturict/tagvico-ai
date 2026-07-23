const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isLocalProxyRequest } = require('../dist/services/proxyAddress');
const setupRoute = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'api', 'setup', 'v3', 'route.ts'),
  'utf8'
);

test('every Next-proxied setup request requires explicit remote-setup opt-in', () => {
  const request = { remoteAddress: '::ffff:127.0.0.1', forwardedFor: '192.0.2.10, 127.0.0.1' };
  assert.equal(isLocalProxyRequest(request), false);
  assert.equal(isLocalProxyRequest({ remoteAddress: '127.0.0.1', forwardedFor: '127.0.0.1' }), false);
  assert.equal(isLocalProxyRequest({ remoteAddress: '127.0.0.1', forwardedFor: '' }), false);
});

test('direct clients cannot spoof locality with forwarded headers', () => {
  const request = { remoteAddress: '192.0.2.10', forwardedFor: '127.0.0.1' };
  assert.equal(isLocalProxyRequest(request), false);
});

test('only a direct backend loopback request without proxy metadata is local', () => {
  assert.equal(isLocalProxyRequest({ remoteAddress: '127.0.0.1' }), true);
  assert.equal(isLocalProxyRequest({ remoteAddress: '::1' }), true);
});

test('Next setup requires opt-in and never forwards client proxy identity headers', () => {
  assert.match(setupRoute, /process\.env\.ALLOW_REMOTE_SETUP !== 'yes'/);
  assert.doesNotMatch(setupRoute, /request\.headers\.get\('x-forwarded-for'\)/i);
  assert.doesNotMatch(setupRoute, /request\.headers\.get\('x-forwarded-host'\)/i);
  assert.doesNotMatch(setupRoute, /request\.headers\.get\('host'\)/i);
});
