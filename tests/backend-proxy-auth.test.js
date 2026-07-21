const test = require('node:test');
const assert = require('node:assert/strict');

const { backendBearerHeaders } = require('../dist/services/backendProxyAuth');

test('internal backend hops convert the web JWT cookie into bearer auth', () => {
  const request = { headers: { get: (name) => name === 'cookie' ? 'theme=dark; jwt=header.payload.signature; other=value' : null } };
  assert.deepEqual(backendBearerHeaders(request), { Authorization: 'Bearer header.payload.signature' });
  assert.equal('cookie' in backendBearerHeaders(request), false);
});

test('internal backend hops do not invent credentials when the session cookie is absent', () => {
  const request = { headers: { get: () => 'theme=dark' } };
  assert.deepEqual(backendBearerHeaders(request), {});
});
