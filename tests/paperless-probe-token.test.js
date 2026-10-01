const test = require('node:test');
const assert = require('node:assert/strict');
const { samePaperlessInstance, tokenForProbe } = require('../dist/services/paperlessIdentityService');

const saved = { url: 'http://paperless.internal:8000/api', token: 'saved-token' };

test('the saved Paperless token is only used for the saved address', () => {
  assert.equal(tokenForProbe(undefined, 'http://paperless.internal:8000', saved), 'saved-token');
  assert.equal(tokenForProbe('', 'http://PAPERLESS.internal:8000/', saved), 'saved-token');
  assert.equal(tokenForProbe(undefined, 'http://paperless.internal:8000/api/', saved), 'saved-token');
  assert.equal(tokenForProbe(undefined, 'http://attacker.example', saved), '');
  assert.equal(tokenForProbe(undefined, 'https://paperless.internal:8000', saved), '', 'another scheme is another host');
  assert.equal(tokenForProbe(undefined, 'http://paperless.internal:9000', saved), '');
  assert.equal(tokenForProbe(undefined, 'http://paperless.internal:8000/other', saved), '');
  assert.equal(tokenForProbe(undefined, 'not a url', saved), '');
});

test('a token typed into the request always wins and an unset saved address matches nothing', () => {
  assert.equal(tokenForProbe(' typed-token ', 'http://attacker.example', saved), 'typed-token');
  assert.equal(samePaperlessInstance('', ''), false);
  assert.equal(tokenForProbe(undefined, 'http://paperless.internal:8000', { url: '', token: 'saved-token' }), '');
});
