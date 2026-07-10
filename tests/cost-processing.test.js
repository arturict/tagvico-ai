const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const batchService = require('../dist/services/openaiBatchService');
const anthropicService = require('../dist/services/anthropicService');
const { normalizeProcessingMode } = require('../dist/services/processingMode');

test('processing modes fall back according to provider capabilities', () => {
  assert.equal(normalizeProcessingMode('flex', 'openai'), 'flex');
  assert.equal(normalizeProcessingMode('flex', 'anthropic'), 'standard');
  assert.equal(normalizeProcessingMode('batch', 'openai'), 'batch');
  assert.equal(normalizeProcessingMode('batch', 'anthropic'), 'batch');
  assert.equal(normalizeProcessingMode('batch', 'codex'), 'standard');
});

test('OpenAI requests from one scan share a batch', async () => {
  let inputLines = [];
  const client = {
    files: {
      async create({ file }) {
        inputLines = fs.readFileSync(file.path, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
        return { id: 'file-input' };
      },
      async content() {
        return { async text() {
          return inputLines.map((line) => JSON.stringify({ custom_id: line.custom_id, response: {
            status_code: 200, body: { choices: [{ message: { content: '{"tags":[],"correspondent":"Test"}' } }], usage: {} }
          } })).join('\n');
        } };
      }
    },
    batches: {
      async create() { return { id: 'batch-test', status: 'completed', output_file_id: 'file-output' }; },
      async retrieve() { throw new Error('completed batches should not be polled'); }
    }
  };
  const results = await Promise.all([
    batchService.enqueue(client, { model: 'gpt-test', messages: [{ role: 'user', content: 'one' }] }),
    batchService.enqueue(client, { model: 'gpt-test', messages: [{ role: 'user', content: 'two' }] })
  ]);
  assert.equal(inputLines.length, 2);
  assert.equal(results.every((result) => result.choices[0].message.content.includes('Test')), true);
});

test('Anthropic requests from one scan share a batch', async () => {
  let requests = [];
  anthropicService.client = { messages: { batches: {
    async create(payload) { requests = payload.requests; return { id: 'anthropic-batch', processing_status: 'ended' }; },
    async retrieve() { throw new Error('ended batches should not be polled'); },
    async results() { return (async function* () {
      for (const request of requests) yield {
        custom_id: request.custom_id,
        result: { type: 'succeeded', message: { content: [{ type: 'text', text: '{}' }] } }
      };
    })(); }
  } } };
  const results = await Promise.all([
    anthropicService.enqueueBatch({ model: 'claude-test', messages: [], max_tokens: 10 }),
    anthropicService.enqueueBatch({ model: 'claude-test', messages: [], max_tokens: 10 })
  ]);
  assert.equal(requests.length, 2);
  assert.equal(results.length, 2);
});
