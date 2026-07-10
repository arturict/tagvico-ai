const test = require('node:test');
const assert = require('node:assert/strict');
const paperlessService = require('../dist/services/paperlessService');
paperlessService.getThumbnailImage = async () => null;
const { loadThumbnail, buildUserMessage } = require('../dist/services/thumbnailHelper');

test('thumbnail miss remains text-only', async () => {
  const result = await loadThumbnail('no-thumb');
  assert.deepEqual(result, { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null });
  assert.deepEqual(buildUserMessage('hello', null), [{ type: 'text', text: 'hello' }]);
});

test('thumbnail buffer creates an OpenAI-compatible image entry', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const message = buildUserMessage('hello', png);
  const image = message.find((entry) => entry.type === 'image_url');
  assert.ok(image);
  assert.match(image.image_url.url, /^data:image\/png;base64,/);
});
