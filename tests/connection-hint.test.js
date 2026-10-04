const test = require('node:test');
const assert = require('node:assert/strict');
const { describePaperlessConnectionError, isLoopbackUrl } = require('../dist/services/connectionHint');

test('a loopback Paperless address explains that it points at the Tagvico container', () => {
  for (const url of ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000']) {
    const message = describePaperlessConnectionError('ECONNREFUSED', url);
    assert.match(message, /If Tagvico runs in Docker, .* is the Tagvico container itself/);
    assert.match(message, /ECONNREFUSED/, 'the raw code stays visible for troubleshooting');
  }
});

test('a certificate error on localhost is explained as a certificate error', () => {
  const message = describePaperlessConnectionError('DEPTH_ZERO_SELF_SIGNED_CERT', 'https://localhost:8000');
  assert.match(message, /certificate/);
  assert.doesNotMatch(message, /Tagvico container/);
});

test('an unresolved name distinguishes host.docker.internal from a Compose service name', () => {
  assert.match(
    describePaperlessConnectionError('ENOTFOUND', 'http://host.docker.internal:8000'),
    /host-gateway/
  );
  assert.match(
    describePaperlessConnectionError('ENOTFOUND', 'http://paperless-ngx:8000'),
    /paperless-ngx does not resolve.*same Docker network/
  );
});

test('timeouts, refused connections and certificate errors get distinct guidance', () => {
  assert.match(describePaperlessConnectionError('ECONNABORTED', 'http://192.0.2.10:8000'), /timed out.*loopback/);
  assert.match(describePaperlessConnectionError('ECONNREFUSED', 'http://192.0.2.10:8000'), /Check the port/);
  assert.match(describePaperlessConnectionError('DEPTH_ZERO_SELF_SIGNED_CERT', 'https://paperless.example'), /certificate/);
});

test('an unknown code is passed through unchanged', () => {
  assert.equal(describePaperlessConnectionError('ESOMETHING', 'http://paperless.example'), 'ESOMETHING');
});

test('loopback runtime URLs are recognised so provider errors can explain them', () => {
  assert.equal(isLoopbackUrl('http://localhost:11434'), true);
  assert.equal(isLoopbackUrl('http://127.0.0.1:11434'), true);
  assert.equal(isLoopbackUrl('http://ollama:11434'), false);
  assert.equal(isLoopbackUrl('not a url'), false);
});
