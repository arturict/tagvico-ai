/**
 * Test script to verify the thumbnail null-handling in OpenAIService.analyzeDocument
 *
 * When paperlessService.getThumbnailImage returns null:
 * - The cache write should be skipped entirely
 * - The model should be called with text-only content
 * - The messages array should NOT contain an image_url entry
 */
const path = require('path');
const fs = require('fs').promises;
const fssync = require('fs');

// Mock the paperless service BEFORE requiring the service under test
const paperlessService = require('./services/paperlessService');
paperlessService.getThumbnailImage = async () => null;

// Spy on fs.promises.writeFile at module level
const realWriteFile = fs.writeFile.bind(fs);
let writeFileInvocations = [];
fs.writeFile = async (filePath, data) => {
  writeFileInvocations.push({ filePath, data });
  // Do not actually write when data is null
  if (data === null || data === undefined) {
    throw new Error('fs.writeFile called with null/undefined data - this is the bug we are guarding against');
  }
  return realWriteFile(filePath, data);
};

// Now load the service under test (it will pick up the mocked fs and paperlessService)
const openaiService = require('./services/openaiService');

// Capture the messages the stub client sees
let capturedMessages = null;

// Install a stub client that records the messages
openaiService.client = {
  chat: {
    completions: {
      create: async (payload) => {
        capturedMessages = payload.messages;
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  tags: ['mocked-tag'],
                  correspondent: 'mocked-correspondent',
                  title: 'mocked-title',
                  document_date: '2024-01-01',
                  language: 'en',
                  custom_fields: {}
                })
              }
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        };
      }
    }
  }
};

async function run() {
  // Ensure no stale cache file exists for this id
  const testId = 99999;
  const cachePath = path.join('./public/images', `${testId}.png`);
  try {
    await fs.unlink(cachePath);
  } catch (_) {
    /* not present */
  }

  const result = await openaiService.analyzeDocument(
    'Sample document text body',
    [],
    [],
    [],
    testId
  );

  let failed = false;

  // Assertion 1: fs.writeFile was never called with null/undefined data
  const nullWrites = writeFileInvocations.filter((i) => i.data === null || i.data === undefined);
  if (nullWrites.length > 0) {
    console.error('FAIL: fs.writeFile was called with null/undefined data:', nullWrites);
    failed = true;
  } else {
    console.log('OK: fs.writeFile was not called with null/undefined data');
  }

  // Assertion 2: stub client was invoked and messages captured
  if (!capturedMessages) {
    console.error('FAIL: stub client was never invoked');
    failed = true;
  } else {
    const userMsg = capturedMessages.find((m) => m.role === 'user');
    if (!userMsg) {
      console.error('FAIL: no user message in payload');
      failed = true;
    } else {
      const contents = Array.isArray(userMsg.content) ? userMsg.content : [{ type: 'text', text: userMsg.content }];
      const hasImageUrl = contents.some((c) => c && c.type === 'image_url');
      if (hasImageUrl) {
        console.error('FAIL: messages array contains an image_url entry, but thumbnail was missing');
        failed = true;
      } else {
        console.log('OK: messages array does not contain an image_url entry');
      }
    }
  }

  // Assertion 3: analyzeDocument did not return an error
  if (result && result.error) {
    console.error('FAIL: analyzeDocument returned an error:', result.error);
    failed = true;
  } else {
    console.log('OK: analyzeDocument returned without error');
  }

  if (failed) {
    console.error('\n=== Test FAILED ===');
    process.exit(1);
  } else {
    console.log('\n=== Test PASSED ===');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Unexpected error in test:', err);
  process.exit(1);
});
