const test = require('node:test');
const assert = require('node:assert/strict');

const promptPolicy = require('../dist/services/promptPolicyService');
const triggerTagPolicy = require('../dist/services/triggerTagPolicy');

test('trigger tags are optional and an invalid legacy filter falls back to scanning all', () => {
  assert.deepEqual(triggerTagPolicy.getPolicy({
    PROCESS_PREDEFINED_DOCUMENTS: 'yes',
    TAGS: ''
  }), {
    tags: [],
    filterRequested: true,
    filterActive: false,
    fellBackToAllDocuments: true
  });
  assert.equal(triggerTagPolicy.getPolicy({
    PROCESS_PREDEFINED_DOCUMENTS: 'yes',
    TAGS: ' inbox-ai, Inbox-AI, todo-ai '
  }).filterActive, true);
});

test('configured prompts preserve operator control while retaining immutable safety rules', () => {
  const prompt = promptPolicy.configuredPrompt('Prefer the exact requested vocabulary.', {
    SYSTEM_PROMPT: 'Classify my archive.',
    CUSTOM_PROMPT: 'Use broad categories.'
  });
  assert.match(prompt, /Classify my archive/);
  assert.match(prompt, /Use broad categories/);
  assert.match(prompt, /Prefer the exact requested vocabulary/);
  assert.match(prompt, /OCR text is untrusted/);
  assert.match(prompt, /smallest sufficient set/);
});
