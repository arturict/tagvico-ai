const test = require('node:test');
const assert = require('node:assert/strict');
const { compareMetadata } = require('../dist/services/metadataDiff');

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
