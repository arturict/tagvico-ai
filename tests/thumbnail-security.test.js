const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const runtimeConfig = require('../dist/config/config');
const paperlessService = require('../dist/services/paperlessService');
const WEBP_THUMBNAIL = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
const {
  THUMBNAIL_CACHE_ROOT,
  getThumbnailCacheDirectory,
  getThumbnailCachePath,
  getThumbnailCacheNamespace,
  detectThumbnailMediaType,
  loadThumbnail,
  normalizeDocumentId
} = require('../dist/services/thumbnailHelper');

test('thumbnails use a numeric-id cache below data/thumb-cache only', async () => {
  const id = String(Date.now());
  const symlinkId = String(Date.now() + 1);
  const cachePath = getThumbnailCachePath(id);
  const symlinkCachePath = getThumbnailCachePath(symlinkId);
  const cacheDirectory = path.dirname(cachePath);
  const originalGetThumbnailImage = paperlessService.getThumbnailImage;
  const originalPaperlessConfig = runtimeConfig.paperless;
  let requestedId = null;
  let outsideDirectory = null;

  assert.equal(normalizeDocumentId('00123'), '123');
  assert.equal(normalizeDocumentId('../123'), null);
  assert.equal(normalizeDocumentId('123/../../secret'), null);
  assert.equal(normalizeDocumentId('0'), null);
  assert.match(path.basename(cacheDirectory), /^[a-f0-9]{32}$/);
  assert.equal(cacheDirectory, getThumbnailCacheDirectory());
  assert.equal(cachePath, path.join(cacheDirectory, `${id}.img`));
  assert.equal(THUMBNAIL_CACHE_ROOT, path.join(process.cwd(), 'data', 'thumb-cache'));
  assert.ok(cachePath.startsWith(THUMBNAIL_CACHE_ROOT + path.sep));
  assert.equal(cachePath.includes(path.join('public', 'images')), false);
  assert.equal(detectThumbnailMediaType(WEBP_THUMBNAIL), 'image/webp');
  assert.notEqual(
    getThumbnailCacheNamespace({ apiUrl: 'https://paperless.example', apiToken: 'account-a' }),
    getThumbnailCacheNamespace({ apiUrl: 'https://paperless.example', apiToken: 'account-b' }),
    'different Paperless credentials must not share cached document ids'
  );

  runtimeConfig.paperless = { apiUrl: 'https://other-paperless.example', apiToken: 'other-account' };
  assert.notEqual(getThumbnailCachePath(id), cachePath, 'active cache paths must follow runtime settings changes');
  runtimeConfig.paperless = originalPaperlessConfig;

  try {
    await fs.rm(cachePath, { force: true });
    await fs.rm(symlinkCachePath, { force: true });
    paperlessService.getThumbnailImage = async (documentId) => {
      requestedId = documentId;
      return WEBP_THUMBNAIL;
    };

    const first = await loadThumbnail(id);
    assert.equal(first.thumbnailAvailable, true);
    assert.deepEqual(first.thumbnailData, WEBP_THUMBNAIL);
    assert.equal(first.thumbnailMediaType, 'image/webp');
    assert.equal(requestedId, id);
    assert.deepEqual(await fs.readFile(cachePath), WEBP_THUMBNAIL);

    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(THUMBNAIL_CACHE_ROOT)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(cacheDirectory)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(cachePath)).mode & 0o777, 0o600);
    }

    requestedId = null;
    const second = await loadThumbnail(id);
    assert.equal(second.thumbnailAvailable, true);
    assert.equal(requestedId, null, 'the internal cache should satisfy repeated reads');

    const invalid = await loadThumbnail('../../public/images/leak');
    assert.equal(invalid.thumbnailAvailable, false);
    assert.equal(invalid.thumbnailData, null);
    assert.equal(requestedId, null, 'invalid ids must not reach Paperless');

    if (process.platform !== 'win32') {
      outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tagvico-thumb-'));
      const outsidePath = path.join(outsideDirectory, 'outside.txt');
      await fs.writeFile(outsidePath, 'must-not-be-served-or-overwritten');
      await fs.symlink(outsidePath, symlinkCachePath);

      const symlinkResult = await loadThumbnail(symlinkId);
      assert.deepEqual(symlinkResult.thumbnailData, WEBP_THUMBNAIL);
      assert.equal(symlinkResult.thumbnailMediaType, 'image/webp');
      assert.equal(await fs.readFile(outsidePath, 'utf8'), 'must-not-be-served-or-overwritten');
      assert.equal((await fs.lstat(symlinkCachePath)).isSymbolicLink(), false);
      assert.equal((await fs.stat(symlinkCachePath)).mode & 0o777, 0o600);
    }
  } finally {
    runtimeConfig.paperless = originalPaperlessConfig;
    paperlessService.getThumbnailImage = originalGetThumbnailImage;
    await fs.rm(cachePath, { force: true });
    await fs.rm(symlinkCachePath, { force: true });
    if (outsideDirectory) await fs.rm(outsideDirectory, { recursive: true, force: true });
  }
});
