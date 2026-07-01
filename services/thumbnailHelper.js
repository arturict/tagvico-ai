"use strict";
/**
 * Thumbnail loading and message-building helpers.
 *
 * Shared by OpenAI, Custom, and Azure services so the cache-then-fetch logic
 * and the multimodal user-message construction live in exactly one place.
 */
const fs = require('fs').promises;
const path = require('path');
// paperlessService is still JS — treat it as untyped until it is migrated.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const paperlessService = require('./paperlessService');
/**
 * Load a thumbnail for a document, preferring the on-disk cache.
 *
 * @param id - Document id used both for the Paperless request and the cache
 *   filename (`<cacheDir>/<id>.png`).
 * @param cacheDir - Directory the cached PNG lives in.
 * @returns The thumbnail buffer when available, or `null` when the thumbnail
 *   could not be loaded from either the cache or Paperless.
 */
async function loadThumbnail(id, cacheDir) {
    const cachePath = path.join(cacheDir, `${id}.png`);
    try {
        await fs.access(cachePath);
        console.log('[DEBUG] Thumbnail already cached');
        const data = await fs.readFile(cachePath);
        return { thumbnailData: data, thumbnailAvailable: !!data };
    }
    catch {
        console.log('Thumbnail not cached, fetching from Paperless');
        const data = await paperlessService.getThumbnailImage(id);
        if (!data) {
            console.warn(`Thumbnail for document ${id} not available from Paperless, continuing with text-only analysis`);
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
 * @param text - The text portion of the message.
 * @param thumbnailData - Optional thumbnail buffer; when present it is appended
 *   as a base64 PNG `image_url` entry.
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
