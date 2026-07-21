const test = require('node:test');
const assert = require('node:assert/strict');

const { allowsMutationOrigin } = require('../dist/services/csrfOrigin');

test('CSRF origin accepts direct same-origin mutations', () => {
  assert.equal(allowsMutationOrigin({ source: 'https://tagvico.example', host: 'tagvico.example', remoteAddress: '203.0.113.10' }), true);
});

test('CSRF origin accepts the public forwarded host only from the loopback Next proxy', () => {
  const request = { source: 'https://tagvico.example', host: '127.0.0.1:3001', forwardedHost: 'tagvico.example', remoteAddress: '::ffff:127.0.0.1' };
  assert.equal(allowsMutationOrigin(request), true);
  assert.equal(allowsMutationOrigin({ ...request, remoteAddress: '203.0.113.10' }), false);
});

test('CSRF origin rejects missing, malformed, and cross-site sources', () => {
  assert.equal(allowsMutationOrigin({ host: 'tagvico.example', remoteAddress: '127.0.0.1' }), false);
  assert.equal(allowsMutationOrigin({ source: 'not a url', host: 'tagvico.example', remoteAddress: '127.0.0.1' }), false);
  assert.equal(allowsMutationOrigin({ source: 'https://attacker.example', host: 'tagvico.example', forwardedHost: 'tagvico.example', remoteAddress: '127.0.0.1' }), false);
});
