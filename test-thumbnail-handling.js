/**
 * Tests for services/thumbnailHelper.ts (after `npm run build`)
 *
 * Targets the helper directly:
 *  - loadThumbnail propagates the null result from paperlessService
 *  - buildUserMessage omits image_url when no thumbnail is present
 *  - buildUserMessage adds image_url when a Buffer is provided
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs').promises;

// Mock the paperless service BEFORE requiring the helper so the helper
// picks up the stub.
const paperlessService = require('./dist/services/paperlessService');
paperlessService.getThumbnailImage = async () => null;

const { loadThumbnail, buildUserMessage, getThumbnailCachePath } = require('./dist/services/thumbnailHelper');

async function run() {
  // --- loadThumbnail: returns null/available=false when Paperless has no image ---
  const id = String(Date.now());
  const cachePath = getThumbnailCachePath(id);
  // Make sure no stale cache file is present.
  await fsp.rm(cachePath, { force: true });

  const result = await loadThumbnail(id);
  assert.equal(result.thumbnailAvailable, false, 'thumbnailAvailable should be false');
  assert.equal(result.thumbnailData, null, 'thumbnailData should be null');
  console.log('OK: loadThumbnail returns thumbnailAvailable=false, thumbnailData=null on miss');

  // Sanity: no cache file should have been written on a miss.
  const cached = fs.existsSync(cachePath);
  assert.equal(cached, false, 'no cache file should be written on a miss');
  console.log('OK: loadThumbnail does not write a cache file on a miss');

  // --- buildUserMessage: text-only when thumbnailData is null ---
  const textOnly = buildUserMessage('hello', null);
  assert.equal(textOnly.length, 1, 'text-only message should have one entry');
  assert.equal(textOnly[0].type, 'text');
  assert.equal(textOnly[0].text, 'hello');
  const hasImageUrlTextOnly = textOnly.some(function (c) {
    return c && c.type === 'image_url';
  });
  assert.equal(hasImageUrlTextOnly, false, 'text-only message must not contain image_url');
  console.log('OK: buildUserMessage("hello", null) contains no image_url entry');

  // --- buildUserMessage: image_url present when a Buffer is provided ---
  const withImage = buildUserMessage(
    'hello',
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const imageEntry = withImage.find(function (c) {
    return c && c.type === 'image_url';
  });
  assert.ok(imageEntry, 'image_url entry should be present when a Buffer is provided');
  assert.ok(
    typeof imageEntry.image_url.url === 'string' &&
      imageEntry.image_url.url.indexOf('data:image/png;base64,') === 0,
    'image_url.url must be a data: PNG base64 URL'
  );
  console.log('OK: buildUserMessage("hello", Buffer) contains an image_url entry');

  // Cleanup
  await fsp.rm(cachePath, { force: true });

  console.log('\n=== Test PASSED ===');
}

run().catch(function (err) {
  console.error('Unexpected error in test:', err);
  process.exit(1);
});
