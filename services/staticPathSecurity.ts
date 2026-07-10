type RequestLike = { originalUrl?: string; url?: string };
type ResponseLike = { status(code: number): ResponseLike; end(): unknown };
type Next = () => unknown;
const fs = require('node:fs').promises;
const path = require('node:path');
const parseUrl = require('parseurl');

function decodeAndNormalizePath(rawUrl: unknown): string | null {
  const requestTarget = String(rawUrl || '');
  let rawPath = '';

  try {
    // Use the exact parser Express uses so unusual absolute-form request
    // targets cannot produce a different pathname in this guard and static.
    rawPath = parseUrl({ url: requestTarget })?.pathname || '';
  } catch {
    return null;
  }

  try {
    const decoded = decodeURIComponent(rawPath).replace(/\\/g, '/');
    const segments: string[] = [];

    for (const segment of decoded.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        segments.pop();
      } else {
        segments.push(segment);
      }
    }

    return `/${segments.join('/')}`;
  } catch {
    return null;
  }
}

/**
 * Detect the old public thumbnail directory after the same URL decoding and
 * path normalization that static-file middleware performs. Checking only an
 * Express mount path can be bypassed with encoded slashes or characters.
 */
function isLegacyPublicImagePath(rawUrl: unknown): boolean {
  const normalized = decodeAndNormalizePath(rawUrl);
  if (!normalized) return false;
  const caseFolded = normalized.toLowerCase();
  return caseFolded === '/images' || caseFolded.startsWith('/images/');
}

function blockLegacyPublicImages(req: RequestLike, res: ResponseLike, next: Next): unknown {
  const rawUrl = req.originalUrl || req.url || '';
  const normalized = decodeAndNormalizePath(rawUrl);

  // Malformed percent escapes must not fall through to another parser with
  // different decoding behavior.
  if (normalized === null) return res.status(400).end();
  if (isLegacyPublicImagePath(rawUrl)) return res.status(404).end();
  return next();
}

async function removeLegacyPublicThumbnailCache(
  publicDirectory = path.join(process.cwd(), 'public')
): Promise<number> {
  const legacyDirectory = path.join(publicDirectory, 'images');
  let entries;

  try {
    entries = await fs.readdir(legacyDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    // Older releases generated exactly `<numeric document id>.png`. Keep the
    // cleanup deliberately narrow so unrelated user assets are never deleted.
    if (!/^\d+\.png$/.test(entry.name) || (!entry.isFile() && !entry.isSymbolicLink())) continue;
    await fs.unlink(path.join(legacyDirectory, entry.name));
    removed += 1;
  }
  return removed;
}

export = {
  blockLegacyPublicImages,
  decodeAndNormalizePath,
  isLegacyPublicImagePath,
  removeLegacyPublicThumbnailCache
};
