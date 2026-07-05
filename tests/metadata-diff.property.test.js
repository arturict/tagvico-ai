const test = require('node:test');
const assert = require('node:assert/strict');
const { compareMetadata, deepEqual, fingerprint } = require('../dist/services/metadataDiff');

function randomValue(depth = 0) {
  const values = [null, '', Math.random().toString(36).slice(2), Math.floor(Math.random() * 1000), Math.random() > 0.5];
  if (depth > 2 || Math.random() < 0.55) return values[Math.floor(Math.random() * values.length)];
  if (Math.random() < 0.5) return Array.from({ length: Math.floor(Math.random() * 5) }, () => randomValue(depth + 1));
  return Object.fromEntries(Array.from({ length: Math.floor(Math.random() * 5) }, (_, i) => [`k${i}`, randomValue(depth + 1)]));
}

test('metadataDiff satisfies identity, determinism and patch reconstruction properties', () => {
  for (let i = 0; i < 500; i += 1) {
    const before = { a: randomValue(), b: randomValue(), tags: [1, 2, 3].sort(() => Math.random() - 0.5) };
    const after = { a: randomValue(), c: randomValue(), tags: [3, 2, 1] };
    assert.deepEqual(compareMetadata(before, before), []);
    assert.deepEqual(compareMetadata(before, after), compareMetadata(before, after));
    assert.equal(compareMetadata(before, after).some((change) => change.field === 'tags'), false);
    const reconstructed = { ...before };
    for (const change of compareMetadata(before, after)) {
      if (change.after === undefined) delete reconstructed[change.field];
      else reconstructed[change.field] = change.after;
    }
    assert.deepEqual(compareMetadata(reconstructed, after), []);
  }
});

test('metadataDiff reports explicit field changes and ignores primitive-array ordering', () => {
  const titleDiff = compareMetadata({ title: 'Old' }, { title: 'New' });
  assert.deepEqual(titleDiff, [{ field: 'title', before: 'Old', after: 'New', applied: true }]);
  assert.deepEqual(compareMetadata({ tags: [1, 2, 3] }, { tags: [3, 1, 2] }), []);
  assert.equal(compareMetadata(
    { custom_fields: [{ field: 4, value: 'old' }] },
    { custom_fields: [{ field: 4, value: 'new' }] }
  )[0].field, 'custom_fields');
  assert.deepEqual(compareMetadata({ title: 'X' }, { title: 'X', language: 'de' })[0], {
    field: 'language', before: undefined, after: 'de', applied: true
  });
});

test('metadataDiff helper equality and fingerprints are stable', () => {
  assert.equal(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }), true);
  assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(fingerprint([1, 2, 3]), fingerprint([3, 2, 1]));
});
