const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chatCompletionsToolReasoningEffort,
  isOpenAIReasoningModel,
  openAIReasoningEffort
} = require('../dist/services/openaiModelParameters');

test('GPT-6 counts as a reasoning model, directly and through OpenRouter', () => {
  for (const id of ['gpt-6-luna', 'openai/gpt-6-sol', 'gpt-5.4-mini', 'o3-mini']) {
    assert.equal(isOpenAIReasoningModel(id), true, id);
  }
  for (const id of ['gpt-4o-mini', 'gpt-4.1', 'gpt-5-chat-latest', 'gpt-oss:20b-cloud', 'llama3.2', '']) {
    assert.equal(isOpenAIReasoningModel(id), false, id);
  }
});

test('tool calls over Chat Completions use effort none only for GPT-6 Luna and Sol', () => {
  assert.equal(chatCompletionsToolReasoningEffort('gpt-6-luna'), 'none');
  assert.equal(chatCompletionsToolReasoningEffort('openai/gpt-6-sol'), 'none');
  assert.equal(chatCompletionsToolReasoningEffort('gpt-6-astra'), 'low');
  assert.equal(chatCompletionsToolReasoningEffort('gpt-5.4-nano'), 'low');
});

test('the global effort is mapped onto values GPT-6 accepts', () => {
  assert.equal(openAIReasoningEffort('gpt-6-luna', 'auto'), undefined);
  assert.equal(openAIReasoningEffort('gpt-6-luna', undefined), undefined);
  assert.equal(openAIReasoningEffort('gpt-6-luna', 'minimal'), 'low');
  assert.equal(openAIReasoningEffort('gpt-6-luna', 'ultra'), 'max');
  assert.equal(openAIReasoningEffort('gpt-6-luna', 'none'), 'none');
  assert.equal(openAIReasoningEffort('gpt-6-astra', 'none'), 'low');
  assert.equal(openAIReasoningEffort('gpt-6-sol', 'xhigh'), 'xhigh');
  assert.equal(openAIReasoningEffort('gpt-5.4-mini', 'minimal'), 'minimal');
});
