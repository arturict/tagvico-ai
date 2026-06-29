// services/reviewService.js
//
// Read-only support for the dry-run review mode. Lists the latest auto-analyzed
// documents and provides a thin wrapper that calls paperlessService.updateDocument
// once the user clicks "Apply" on a single analysis. The actual patch logic
// (mapping a partial metadata object onto a Paperless PATCH call) is intentionally
// left as a TODO — wiring it up lands in a follow-up commit alongside the
// paperlessService.patchDocument helper.

const fs = require('fs');
const path = require('path');
const documentModel = require('../models/document.js');
const paperlessService = require('./paperlessService.js');

const REVIEW_PATH = path.join(process.cwd(), 'data', '.review');

function loadReviewConfig() {
  // Default: dry-run mode is on. Operators opt out by setting DRY_RUN=false.
  const defaults = { DRY_RUN: 'true' };
  if (!fs.existsSync(REVIEW_PATH)) return defaults;
  const values = { ...defaults };
  String(fs.readFileSync(REVIEW_PATH, 'utf8') || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) values[key] = value;
    });
  return values;
}

function writeReviewConfig(payload = {}) {
  fs.mkdirSync(path.dirname(REVIEW_PATH), { recursive: true });
  const merged = { ...loadReviewConfig(), ...payload };
  const body = [
    '# Archivista AI dry-run review settings',
    '# DRY_RUN=true (default) means new AI suggestions land in the review queue',
    '# instead of being written back to Paperless-ngx automatically.'
  ];
  for (const [key, value] of Object.entries(merged)) {
    body.push(`${key}=${value}`);
  }
  fs.writeFileSync(REVIEW_PATH, `${body.join('\n')}\n`);
  return merged;
}

function isDryRunEnabled() {
  const cfg = loadReviewConfig();
  const value = String(cfg.DRY_RUN || 'true').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * List the latest auto-analyzed documents. For now we project the history table
 * — that's the closest signal we have to "auto-analyzed" without a separate
 * analysis table. Each row carries the proposed metadata so the review UI can
 * render it directly.
 *
 * @param {number} limit - Max rows to return (default 20).
 * @returns {Promise<Array<object>>}
 */
async function listRecentAnalyses(limit = 20) {
  const rows = await documentModel.getAllHistory();
  if (!Array.isArray(rows)) return [];

  return rows
    .slice()
    .sort((a, b) => {
      const aTs = new Date(a.created_at || 0).getTime();
      const bTs = new Date(b.created_at || 0).getTime();
      return bTs - aTs;
    })
    .slice(0, limit)
    .map((row) => {
      let parsedTags = [];
      try {
        parsedTags = row.tags ? JSON.parse(row.tags) : [];
      } catch (e) {
        parsedTags = [];
      }
      return {
        document_id: row.document_id,
        title: row.title || null,
        correspondent: row.correspondent || null,
        tags: Array.isArray(parsedTags) ? parsedTags : [],
        created_at: row.created_at
      };
    });
}

/**
 * Apply a partial metadata object back to Paperless-ngx. The shape of
 * `metadata` matches the existing updateData object that buildUpdateData
 * produces in routes/setup.js: { title, tags, correspondent, document_type,
 * custom_fields, owner }.
 *
 * NOTE: This currently returns a "skipped" result for the actual patch call.
 * The next commit introduces paperlessService.patchDocument and wires it here.
 *
 * @param {number|string} documentId
 * @param {object} metadata
 * @returns {Promise<{ok: boolean, reason?: string, dryRun: boolean}>}
 */
async function applyMetadata(documentId, metadata = {}) {
  if (!documentId) {
    return { ok: false, reason: 'documentId is required', dryRun: isDryRunEnabled() };
  }

  if (isDryRunEnabled()) {
    return { ok: false, reason: 'DRY_RUN is enabled; enable writes in /settings', dryRun: true };
  }

  // TODO: implement paperlessService.patchDocument call here
  // The follow-up commit will:
  //   1. Add `patchDocument(id, partialMetadata)` to paperlessService.js.
  //   2. Map the partial metadata keys onto the Paperless fields here.
  //   3. Replace the placeholder below with a real call.
  if (typeof paperlessService.patchDocument === 'function') {
    return await paperlessService.patchDocument(documentId, metadata);
  }

  return { ok: false, reason: 'paperlessService.patchDocument not implemented', dryRun: false };
}

module.exports = {
  REVIEW_PATH,
  loadReviewConfig,
  writeReviewConfig,
  isDryRunEnabled,
  listRecentAnalyses,
  applyMetadata
};
