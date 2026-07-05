const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const paperlessService = require('../dist/services/paperlessService');
paperlessService.getThumbnailImage = async () => null;
const { loadThumbnail, buildUserMessage } = require('../dist/services/thumbnailHelper');

test('thumbnail miss remains text-only and does not create a cache file', async (t) => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'thumbnail-helper-'));
  t.after(() => fsp.rm(tmpDir, { recursive: true, force: true }));
  const result = await loadThumbnail('no-thumb', tmpDir);
  assert.deepEqual(result, { thumbnailData: null, thumbnailAvailable: false });
  assert.equal(fs.existsSync(path.join(tmpDir, 'no-thumb.png')), false);
  assert.deepEqual(buildUserMessage('hello', null), [{ type: 'text', text: 'hello' }]);
});

test('thumbnail buffer creates an OpenAI-compatible image entry', () => {
  const message = buildUserMessage('hello', Buffer.from('fake'));
  const image = message.find((entry) => entry.type === 'image_url');
  assert.ok(image);
  assert.match(image.image_url.url, /^data:image\/png;base64,/);
});
