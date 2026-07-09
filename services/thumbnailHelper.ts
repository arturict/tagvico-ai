/**
 * Thumbnail loading and message-building helpers.
 *
 * Shared by OpenAI, Custom, and Azure services so the cache-then-fetch logic
 * and the multimodal user-message construction live in exactly one place.
 */

const fsModule = require('fs');
const fs = fsModule.promises;
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const config = require('../config/config') as {
  paperless?: { apiUrl?: string; apiToken?: string };
};
// paperlessService is still JS — treat it as untyped until it is migrated.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const paperlessService = require('./paperlessService') as {
  getThumbnailImage: (id: number | string) => Promise<Buffer | null>;
};

declare namespace thumbnailHelper {
  type ThumbnailMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

  /** Result of a thumbnail load attempt. */
  interface ThumbnailLoadResult {
    thumbnailData: Buffer | null;
    thumbnailAvailable: boolean;
    thumbnailMediaType: ThumbnailMediaType | null;
  }

  /** A single entry in an OpenAI-style multimodal user-message `content` array. */
  type UserMessageContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };
}

/**
 * Paperless thumbnails contain document data and must never be written below
 * `public/`. Keep the cache in the application data directory instead.
 */
const THUMBNAIL_CACHE_ROOT = path.join(process.cwd(), 'data', 'thumb-cache');
function getThumbnailCacheNamespace(paperlessConfig = config.paperless): string {
  return createHash('sha256')
    .update(`${paperlessConfig?.apiUrl || ''}\0${paperlessConfig?.apiToken || ''}`)
    .digest('hex')
    .slice(0, 32);
}

const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

function getThumbnailCacheDirectory(): string {
  // Runtime settings can switch Paperless accounts without restarting the
  // process. Resolve this namespace for every operation so document ids from
  // the previous account can never collide with the new account's ids.
  return path.join(THUMBNAIL_CACHE_ROOT, getThumbnailCacheNamespace());
}

/**
 * Convert a Paperless document id to one canonical, filesystem-safe value.
 * Paperless document ids are positive integers; rejecting anything else also
 * prevents path traversal through cache filenames.
 */
function normalizeDocumentId(id: unknown): string | null {
  const value = typeof id === 'number' || typeof id === 'string' ? String(id) : '';
  if (!/^\d+$/.test(value)) return null;

  const numericId = Number(value);
  if (!Number.isSafeInteger(numericId) || numericId < 1) return null;

  return String(numericId);
}

function getThumbnailCachePath(id: unknown): string | null {
  const normalizedId = normalizeDocumentId(id);
  return normalizedId ? path.join(getThumbnailCacheDirectory(), `${normalizedId}.img`) : null;
}

function detectThumbnailMediaType(data: Buffer): thumbnailHelper.ThumbnailMediaType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) {
    return 'image/gif';
  }
  return null;
}

async function ensurePrivateCacheDirectory(cacheDirectory: string): Promise<void> {
  await fs.mkdir(THUMBNAIL_CACHE_ROOT, { recursive: true, mode: 0o700 });
  await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 });

  for (const directory of [THUMBNAIL_CACHE_ROOT, cacheDirectory]) {
    const cacheDirectoryStat = await fs.lstat(directory);
    if (!cacheDirectoryStat.isDirectory() || cacheDirectoryStat.isSymbolicLink()) {
      throw new Error('Thumbnail cache path must be a real directory');
    }

    // mkdir's mode only applies when it creates the directory. Tighten an
    // existing cache too, including caches created by older releases.
    await fs.chmod(directory, 0o700);
  }
}

async function readCachedThumbnail(cachePath: string): Promise<Buffer> {
  const noFollow = fsModule.constants.O_NOFOLLOW || 0;
  const handle = await fs.open(cachePath, fsModule.constants.O_RDONLY | noFollow);

  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_THUMBNAIL_BYTES) {
      throw new Error('Cached thumbnail is not a valid private cache file');
    }

    // Opening with O_NOFOLLOW prevents a cache entry from being replaced by a
    // symlink between validation and reading. chmod applies to that same open
    // file descriptor, so old permissive cache files are repaired safely.
    await handle.chmod(0o600);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function writeCachedThumbnail(cachePath: string, data: Buffer): Promise<void> {
  const cacheDirectory = path.dirname(cachePath);
  await ensurePrivateCacheDirectory(cacheDirectory);

  const temporaryPath = path.join(
    cacheDirectory,
    `.${path.basename(cachePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;

  try {
    // A private, exclusive temporary file plus rename prevents concurrent
    // readers from observing a partially written thumbnail. rename also
    // replaces (rather than follows) a malicious symlink at cachePath.
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, cachePath);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Load a thumbnail for a document, preferring the on-disk cache.
 *
 * @param id - Positive numeric document id used for the Paperless request and
 *   cache filename (`data/thumb-cache/<account>/<id>.img`).
 * @returns The thumbnail buffer when available, or `null` when the thumbnail
 *   could not be loaded from either the cache or Paperless.
 */
async function loadThumbnail(id: number | string): Promise<thumbnailHelper.ThumbnailLoadResult> {
  const normalizedId = normalizeDocumentId(id);
  if (!normalizedId) {
    console.warn('[WARN] Refusing to load a thumbnail with an invalid document id');
    return { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null };
  }

  const cachePath = getThumbnailCachePath(normalizedId);
  if (!cachePath) {
    return { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null };
  }

  try {
    const data = await readCachedThumbnail(cachePath);
    const thumbnailMediaType = detectThumbnailMediaType(data);
    if (!thumbnailMediaType) throw new Error('Cached thumbnail has an unsupported media type');
    console.log('[DEBUG] Thumbnail already cached');
    return { thumbnailData: data, thumbnailAvailable: true, thumbnailMediaType };
  } catch {
    console.log('Thumbnail not cached, fetching from Paperless');

    const fetchedData = await paperlessService.getThumbnailImage(normalizedId);

    if (!fetchedData) {
      console.warn(
        `Thumbnail for document ${normalizedId} not available from Paperless, continuing with text-only analysis`
      );
      return { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null };
    }

    const data = Buffer.isBuffer(fetchedData) ? fetchedData : Buffer.from(fetchedData);
    if (data.length < 1 || data.length > MAX_THUMBNAIL_BYTES) {
      console.warn(`Thumbnail for document ${normalizedId} has an invalid size; continuing with text-only analysis`);
      return { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null };
    }

    const thumbnailMediaType = detectThumbnailMediaType(data);
    if (!thumbnailMediaType) {
      console.warn(`Thumbnail for document ${normalizedId} has an unsupported media type; continuing with text-only analysis`);
      return { thumbnailData: null, thumbnailAvailable: false, thumbnailMediaType: null };
    }

    try {
      await writeCachedThumbnail(cachePath, data);
    } catch (error) {
      // A cache failure must not make document analysis fail. The fetched bytes
      // can still be used in-memory without putting private data in a fallback
      // public location.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[WARN] Could not persist private thumbnail cache: ${message}`);
    }
    return { thumbnailData: data, thumbnailAvailable: true, thumbnailMediaType };
  }
}

/**
 * Build the `content` array for an OpenAI-style multimodal user message.
 *
 * @param text - The text portion of the message.
 * @param thumbnailData - Optional thumbnail buffer; when present it is appended
 *   as a correctly typed base64 `image_url` entry.
 */
function buildUserMessage(
  text: string,
  thumbnailData: Buffer | null
): thumbnailHelper.UserMessageContent[] {
  const content: thumbnailHelper.UserMessageContent[] = [{ type: 'text', text }];

  if (thumbnailData) {
    const thumbnailMediaType = detectThumbnailMediaType(thumbnailData);
    if (!thumbnailMediaType) return content;
    const base64Image = Buffer.isBuffer(thumbnailData)
      ? thumbnailData.toString('base64')
      : Buffer.from(thumbnailData).toString('base64');
    content.push({
      type: 'image_url',
      image_url: { url: `data:${thumbnailMediaType};base64,${base64Image}` }
    });
  }

  return content;
}

export = {
  loadThumbnail,
  buildUserMessage,
  normalizeDocumentId,
  getThumbnailCachePath,
  getThumbnailCacheNamespace,
  getThumbnailCacheDirectory,
  detectThumbnailMediaType,
  THUMBNAIL_CACHE_ROOT,
  MAX_THUMBNAIL_BYTES
};
