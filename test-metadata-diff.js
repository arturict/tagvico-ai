// test-metadata-diff.js
//
// Smoke tests for services/metadataDiff.js. Exercises the common cases
// we expect patchDocument to produce: title change, tag reordering, custom
// field updates, and untouched fields.

const assert = require('assert');
const { compareMetadata, deepEqual, fingerprint } = require('./services/metadataDiff');

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

run('returns empty array for identical inputs', () => {
  const before = { title: 'Invoice', tags: [1, 2] };
  const after = { title: 'Invoice', tags: [1, 2] };
  assert.deepStrictEqual(compareMetadata(before, after), []);
});

run('detects title change', () => {
  const before = { title: 'Old' };
  const after = { title: 'New' };
  const diff = compareMetadata(before, after);
  assert.strictEqual(diff.length, 1);
  assert.strictEqual(diff[0].field, 'title');
  assert.strictEqual(diff[0].before, 'Old');
  assert.strictEqual(diff[0].after, 'New');
  assert.strictEqual(diff[0].applied, true);
});

run('treats reordered primitive arrays as equal', () => {
  const before = { tags: [1, 2, 3] };
  const after = { tags: [3, 1, 2] };
  assert.deepStrictEqual(compareMetadata(before, after), []);
});

run('detects custom field change', () => {
  const before = { custom_fields: [{ field: 4, value: 'old' }] };
  const after = { custom_fields: [{ field: 4, value: 'new' }] };
  const diff = compareMetadata(before, after);
  assert.strictEqual(diff.length, 1);
  assert.strictEqual(diff[0].field, 'custom_fields');
});

run('applies field added only in after snapshot', () => {
  const before = { title: 'X' };
  const after = { title: 'X', language: 'de' };
  const diff = compareMetadata(before, after);
  assert.strictEqual(diff.length, 1);
  assert.strictEqual(diff[0].field, 'language');
  assert.strictEqual(diff[0].before, undefined);
  assert.strictEqual(diff[0].after, 'de');
});

run('exposes applied flag for future per-field error reporting', () => {
  const diff = compareMetadata({ a: 1 }, { a: 2 });
  assert.strictEqual(diff[0].applied, true);
  assert.strictEqual(diff[0].error, undefined);
});

run('deepEqual matches nested objects', () => {
  assert.strictEqual(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }), true);
  assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false);
});

run('fingerprint is stable for reordered primitives', () => {
  assert.strictEqual(fingerprint([1, 2, 3]), fingerprint([3, 2, 1]));
});

if (process.exitCode === 1) {
  console.error('\nFAIL  metadata diff tests');
  process.exit(1);
} else {
  console.log('\nPASS  metadata diff tests');
}
