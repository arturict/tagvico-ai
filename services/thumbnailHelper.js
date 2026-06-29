/**
 * Thumbnail loading and message-building helpers.
 *
 * Shared by OpenAI, Custom, and Azure services so the cache-then-fetch logic
 * and the multimodal user-message construction live in exactly one place.
 */
const fs = require('fs').promises;
const path = require('path');
const paperlessService = require('./paperlessService');

/**
 * Load a thumbnail for a document, preferring the on-disk cache.
 *
 * @param {number|string} id - Document id used both for the Paperless request
 *   and the cache filename (`<cacheDir>/<id>.png`).
 * @param {string} cacheDir - Directory the cached PNG lives in.
 * @returns {Promise<{thumbnailData: Buffer|null, thumbnailAvailable: boolean}>}
 *   - thumbnailAvailable=false, thumbnailData=null when nothing is available
 *   - thumbnailAvailable=true, thumbnailData=Buffer when the thumbnail loaded
 */
async function loadThumbnail(id, cacheDir) {
  const cachePath = path.join(cacheDir, `${id}.png`);

  try {
    await fs.access(cachePath);
    console.log('[DEBUG] Thumbnail already cached');
    const data = await fs.readFile(cachePath);
    return { thumbnailData: data, thumbnailAvailable: !!data };
  } catch (err) {
    console.log('Thumbnail not cached, fetching from Paperless');

    const data = await paperlessService.getThumbnailImage(id);

    if (!data) {
      console.warn(
        `Thumbnail for document ${id} not available from Paperless, continuing with text-only analysis`
      );
      return { thumbnailData: null, thumbnailAvailable: false };
    }

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, data);
    return { thumbnailData: data, thumbnailAvailable: true };
  }
}

/**
 * Build the `content` array for an OpenAI-style multimodal user message.
 *
 * @param {string} text - The text portion of the message.
 * @param {Buffer|null} thumbnailData - Optional thumbnail buffer; when present
 *   it is appended as a base64 PNG image_url entry.
 * @returns {Array<{type: string, text?: string, image_url?: {url: string}}>}
 */
function buildUserMessage(text, thumbnailData) {
  const content = [{ type: 'text', text }];

  if (thumbnailData) {
    const base64Image = Buffer.isBuffer(thumbnailData)
      ? thumbnailData.toString('base64')
      : Buffer.from(thumbnailData).toString('base64');
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${base64Image}` }
    });
  }

  return content;
}

module.exports = {
  loadThumbnail,
  buildUserMessage
};
