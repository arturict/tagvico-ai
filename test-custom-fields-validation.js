// test-custom-fields-validation.js
//
// Smoke tests for the type-aware validator in customFieldsService.
// Coverage:
//   - text accepts any string
//   - date rejects "tomorrow"
//   - boolean rejects "yes"
//   - monetary accepts "12.34" and "12,34" (and "CHF 1'234.50")
//   - URL rejects "not a url"

const assert = require('assert');
const { validateValue, sanitize } = require('./services/customFieldsService');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

run('text accepts any string', () => {
  const field = { id: 1, name: 'note', type: 'string' };
  assert.strictEqual(validateValue(field, 'hello world'), null);
  assert.strictEqual(validateValue(field, ''), null);
  assert.strictEqual(validateValue(field, 'a really long string with punctuation!'), null);
});

run('date rejects "tomorrow"', () => {
  const field = { id: 2, name: 'invoice_date', type: 'date' };
  const reason = validateValue(field, 'tomorrow');
  assert.notStrictEqual(reason, null, 'expected "tomorrow" to be rejected as a date');
  assert.ok(/date/i.test(reason));
});

run('boolean rejects "yes"', () => {
  const field = { id: 3, name: 'paid', type: 'boolean' };
  const reason = validateValue(field, 'yes');
  assert.notStrictEqual(reason, null, 'expected "yes" to be rejected as a boolean');
  assert.ok(/boolean/i.test(reason));
});

run('boolean accepts "true" and "false"', () => {
  const field = { id: 3, name: 'paid', type: 'boolean' };
  assert.strictEqual(validateValue(field, 'true'), null);
  assert.strictEqual(validateValue(field, 'false'), null);
  assert.strictEqual(validateValue(field, true), null);
  assert.strictEqual(validateValue(field, false), null);
});

run('monetary accepts "12.34" and "12,34"', () => {
  const field = { id: 4, name: 'amount', type: 'monetary' };
  assert.strictEqual(validateValue(field, '12.34'), null);
  assert.strictEqual(validateValue(field, '12,34'), null);
  assert.strictEqual(validateValue(field, 12.34), null);
  assert.strictEqual(validateValue(field, "CHF 1'234.50"), null);
});

run('monetary rejects non-numeric input', () => {
  const field = { id: 4, name: 'amount', type: 'monetary' };
  const reason = validateValue(field, 'twelve point three four');
  assert.notStrictEqual(reason, null, 'expected verbose amount to be rejected');
});

run('URL rejects "not a url"', () => {
  const field = { id: 5, name: 'source_url', type: 'url' };
  const reason = validateValue(field, 'not a url');
  assert.notStrictEqual(reason, null, 'expected "not a url" to be rejected as a URL');
  assert.ok(/url/i.test(reason));
});

run('URL accepts a real https URL', () => {
  const field = { id: 5, name: 'source_url', type: 'url' };
  assert.strictEqual(validateValue(field, 'https://example.com/invoice.pdf'), null);
});

run('sanitize drops values that fail validation and keeps valid ones', () => {
  const fields = [
    { id: 1, name: 'note', type: 'string' },
    { id: 2, name: 'invoice_date', type: 'date' },
    { id: 3, name: 'paid', type: 'boolean' },
    { id: 4, name: 'amount', type: 'monetary' },
    { id: 5, name: 'source_url', type: 'url' }
  ];
  const modelOutput = {
    a: { field_name: 'note', value: 'Invoice from Acme' },
    b: { field_name: 'invoice_date', value: 'tomorrow' },
    c: { field_name: 'paid', value: 'yes' },
    d: { field_name: 'amount', value: '12,34' },
    e: { field_name: 'source_url', value: 'not a url' }
  };

  const { valid, dropped } = sanitize(fields, modelOutput);
  assert.strictEqual(valid.note, 'Invoice from Acme');
  assert.strictEqual(valid.amount, '12,34');
  assert.ok(!('invoice_date' in valid), 'date "tomorrow" should be dropped');
  assert.ok(!('paid' in valid), 'boolean "yes" should be dropped');
  assert.ok(!('source_url' in valid), 'url "not a url" should be dropped');
  const droppedNames = dropped.map((d) => d.field).sort();
  assert.deepStrictEqual(droppedNames, ['invoice_date', 'paid', 'source_url']);
});

if (process.exitCode === 1) {
  console.error('\nFAIL  custom fields validation tests');
  process.exit(1);
} else {
  console.log('\nPASS  custom fields validation tests');
}
