const test = require('node:test');
const assert = require('node:assert/strict');
const { validateValue, sanitize } = require('../dist/services/customFieldsService');

test('custom field validation accepts supported values and rejects malformed values', () => {
  assert.equal(validateValue({ name: 'note', type: 'string' }, 'hello'), null);
  assert.equal(validateValue({ name: 'paid', type: 'boolean' }, true), null);
  assert.equal(validateValue({ name: 'paid', type: 'boolean' }, 'false'), null);
  assert.match(validateValue({ name: 'paid', type: 'boolean' }, 'yes'), /boolean/i);
  assert.equal(validateValue({ name: 'amount', type: 'monetary' }, '12,34'), null);
  assert.equal(validateValue({ name: 'amount', type: 'monetary' }, "CHF 1'234.50"), null);
  assert.match(validateValue({ name: 'amount', type: 'monetary' }, 'twelve'), /monetary/i);
  assert.equal(validateValue({ name: 'source', type: 'url' }, 'https://example.com/invoice.pdf'), null);
  assert.match(validateValue({ name: 'source', type: 'url' }, 'not a url'), /url/i);
  assert.match(validateValue({ name: 'date', type: 'date' }, 'tomorrow'), /date/i);
});

test('sanitize keeps valid custom fields and reports rejected fields', () => {
  const fields = [
    { name: 'note', type: 'string' }, { name: 'date', type: 'date' },
    { name: 'paid', type: 'boolean' }, { name: 'amount', type: 'monetary' }
  ];
  const result = sanitize(fields, {
    a: { field_name: 'note', value: 'Invoice' }, b: { field_name: 'date', value: 'tomorrow' },
    c: { field_name: 'paid', value: 'yes' }, d: { field_name: 'amount', value: '12,34' }
  });
  assert.deepEqual(result.valid, { note: 'Invoice', amount: '12,34' });
  assert.deepEqual(result.dropped.map((entry) => entry.field).sort(), ['date', 'paid']);
});
