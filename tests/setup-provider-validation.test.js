'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const axios = require('axios');
const setupService = require('../dist/services/setupService');

test('Ollama setup accepts only a verified tool call from the selected model', async (t) => {
  const originalPost = axios.post;
  t.after(() => {
    axios.post = originalPost;
  });

  let captured;
  axios.post = async (...args) => {
    captured = args;
    return {
      data: {
        message: {
          tool_calls: [{
            function: {
              name: 'confirm_tagvico_tool_support',
              arguments: { supported: true }
            }
          }]
        }
      }
    };
  };

  assert.equal(
    await setupService.validateOllamaConfig(
      'https://ollama.example/',
      'qwen3.5:9b',
      'cloud-token'
    ),
    true
  );
  assert.equal(captured[0], 'https://ollama.example/api/chat');
  assert.equal(captured[1].model, 'qwen3.5:9b');
  assert.equal(captured[1].tools[0].function.name, 'confirm_tagvico_tool_support');
  assert.equal(captured[1].tools[0].function.parameters.additionalProperties, false);
  assert.equal(captured[1].stream, false);
  assert.equal(captured[1].think, false, 'reasoning models must answer with the tool call, not thinking');
  assert.ok(captured[2].timeout >= 60_000, 'a cold local model load must not fail setup');
  assert.equal(captured[2].headers.Authorization, 'Bearer cloud-token');

  axios.post = async () => ({
    data: {
      message: {
        tool_calls: [{
          function: {
            name: 'confirm_tagvico_tool_support',
            arguments: { supported: false }
          }
        }]
      }
    }
  });
  assert.equal(
    await setupService.validateOllamaConfig('http://ollama.internal:11434', 'broken-tools'),
    false
  );
});

test('Azure setup retries operator-defined reasoning-style deployments with max_tokens', async (t) => {
  const previousOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_BASE_URL;
  t.after(() => {
    if (previousOpenAIBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousOpenAIBaseUrl;
  });
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.setHeader('Content-Type', 'application/json');
      if (requests.length === 1) {
        response.statusCode = 400;
        response.end(JSON.stringify({
          error: { message: "Unsupported parameter: 'max_completion_tokens'" }
        }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'confirm_tagvico_tool_support',
                arguments: '{"supported":true}'
              }
            }]
          }
        }]
      }));
    });
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  assert.equal(
    await setupService.validateAzureConfig(
      'azure-test-key',
      `http://127.0.0.1:${address.port}`,
      'gpt-5-operator-name',
      '2024-10-21'
    ),
    true
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_completion_tokens, 2048);
  assert.equal(requests[0].max_tokens, undefined);
  assert.equal(requests[1].max_completion_tokens, undefined);
  assert.equal(requests[1].max_tokens, 64);
});
