const test = require('node:test');
const assert = require('node:assert/strict');

const groups = require('../dist/services/tagGroupService');

test('new installations have presets disabled and permanent Other group', () => {
  const defaults = groups.defaults();
  assert.equal(defaults.every((group) => group.enabled === false), true);
  assert.deepEqual(defaults.find((group) => group.id === 'other'), {
    id: 'other', name: 'Other', permanent: true, enabled: false, tags: []
  });
});

test('preset overrides survive merging while missing presets receive defaults', () => {
  const parsed = groups.parseGroups(JSON.stringify([{ id: 'finance', enabled: true, tags: ['bill', 'Bill', ' Tax '] }]));
  assert.deepEqual(parsed.find((group) => group.id === 'finance').tags, ['bill', 'Tax']);
  assert.equal(parsed.find((group) => group.id === 'health').tags.includes('Medical Report'), true);
});

test('vocabulary is case-insensitively unique and preserves first display casing', () => {
  const vocabulary = groups.flattenVocabulary([
    { id: 'a', name: 'A', enabled: true, tags: ['Invoice', 'Tax'] },
    { id: 'b', name: 'B', enabled: true, tags: ['invoice', 'Receipt'] }
  ]);
  assert.deepEqual(vocabulary, ['Invoice', 'Tax', 'Receipt']);
});

test('controlled suggestions use canonical names, queue unknowns, and respect maximum', () => {
  const env = {
    CONTROLLED_TAGGING_ENABLED: 'yes', TAG_MAX_PER_DOCUMENT: '2',
    TAG_GROUPS_JSON: JSON.stringify([{ id: 'other', enabled: true, tags: ['Invoice', 'Receipt', 'Tax'] }])
  };
  const result = groups.enforceSuggestions(['invoice', 'New Idea', 'Receipt', 'Tax'], env);
  assert.deepEqual(result.valid, ['Invoice', 'Receipt']);
  assert.deepEqual(result.unknown, ['New Idea']);
});

test('legacy mode preserves open tag suggestions', () => {
  assert.deepEqual(groups.enforceSuggestions(['One', 'one', 'Two'], {}).valid, ['One', 'Two']);
});

test('controlled prompt includes exact vocabulary and maximum', () => {
  const prompt = groups.promptContract({
    CONTROLLED_TAGGING_ENABLED: 'yes', TAG_MAX_PER_DOCUMENT: '1',
    TAG_GROUPS_JSON: JSON.stringify([{ id: 'other', enabled: true, tags: ['Canonical Tag'] }])
  });
  assert.match(prompt, /at most 1 tags/);
  assert.match(prompt, /\["Canonical Tag"\]/);
});
