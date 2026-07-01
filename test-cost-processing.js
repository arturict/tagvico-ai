const assert = require('assert');
const fs = require('fs');
const batchService = require('./services/openaiBatchService');
const anthropicService = require('./services/anthropicService');
const { normalizeProcessingMode } = require('./services/processingMode');

async function run() {
  assert.equal(normalizeProcessingMode('flex', 'openai'), 'flex');
  assert.equal(normalizeProcessingMode('flex', 'anthropic'), 'standard');
  assert.equal(normalizeProcessingMode('batch', 'openai'), 'batch');
  assert.equal(normalizeProcessingMode('batch', 'anthropic'), 'batch');
  assert.equal(normalizeProcessingMode('batch', 'codex'), 'standard');

  let inputLines = [];
  const client = {
    files: {
      async create({ file }) {
        inputLines = fs.readFileSync(file.path, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
        return { id: 'file-input' };
      },
      async content() {
        return {
          async text() {
            return inputLines.map((line) => JSON.stringify({
              custom_id: line.custom_id,
              response: {
                status_code: 200,
                body: { choices: [{ message: { content: '{"tags":[],"correspondent":"Test"}' } }], usage: {} }
              }
            })).join('\n');
          }
        };
      }
    },
    batches: {
      async create() { return { id: 'batch-test', status: 'completed', output_file_id: 'file-output' }; },
      async retrieve() { throw new Error('completed batches should not be polled'); }
    }
  };

  const [first, second] = await Promise.all([
    batchService.enqueue(client, { model: 'gpt-test', messages: [{ role: 'user', content: 'one' }] }),
    batchService.enqueue(client, { model: 'gpt-test', messages: [{ role: 'user', content: 'two' }] })
  ]);
  assert.equal(inputLines.length, 2, 'requests from one scan should share a batch');
  assert.equal(first.choices[0].message.content.includes('Test'), true);
  assert.equal(second.choices[0].message.content.includes('Test'), true);

  let anthropicRequests = [];
  anthropicService.client = {
    messages: {
      batches: {
        async create({ requests }) {
          anthropicRequests = requests;
          return { id: 'anthropic-batch', processing_status: 'ended' };
        },
        async retrieve() { throw new Error('ended batches should not be polled'); },
        async results() {
          return (async function* () {
            for (const request of anthropicRequests) {
              yield { custom_id: request.custom_id, result: { type: 'succeeded', message: { content: [{ type: 'text', text: '{}' }] } } };
            }
          })();
        }
      }
    }
  };
  const anthropicResults = await Promise.all([
    anthropicService.enqueueBatch({ model: 'claude-test', messages: [], max_tokens: 10 }),
    anthropicService.enqueueBatch({ model: 'claude-test', messages: [], max_tokens: 10 })
  ]);
  assert.equal(anthropicRequests.length, 2, 'Claude requests from one scan should share a batch');
  assert.equal(anthropicResults.length, 2);
  console.log('PASS cost-processing tests');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
