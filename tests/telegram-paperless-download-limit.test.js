const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

const { TelegramPaperlessClient } = require('../dist/services/telegramPaperlessClient');

test('Paperless download limit aborts a chunked response before metadata lookup', async () => {
  const responseBytes = 51 * 1024 * 1024;
  const chunk = Buffer.alloc(1024 * 1024, 0x41);
  let metadataRequested = false;

  const server = createServer((request, response) => {
    if (request.url === '/api/documents/1/download/') {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      let sent = 0;
      const write = () => {
        while (!response.destroyed && sent < responseBytes) {
          const remaining = responseBytes - sent;
          const next = remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
          sent += next.length;
          if (!response.write(next)) {
            response.once('drain', write);
            return;
          }
        }
        if (!response.destroyed) response.end();
      };
      write();
      return;
    }

    if (request.url === '/api/documents/1/') {
      metadataRequested = true;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: 1, title: 'Should not be requested' }));
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const client = new TelegramPaperlessClient(
      `http://127.0.0.1:${address.port}/api`,
      'local-test-token'
    );

    await assert.rejects(
      () => client.downloadDocument(1),
      /maxContentLength size of 52428800 exceeded/
    );
    assert.equal(metadataRequested, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
