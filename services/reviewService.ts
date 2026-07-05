// services/reviewService.js
//
// Read-only support for the dry-run review mode. Lists the latest auto-analyzed
// documents and provides a thin wrapper that calls paperlessService.patchDocument
// once the user clicks "Apply" on a single analysis. The diff that the patch
// returns is persisted via historyService so the history view can render it.

import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentModel = require('../models/document.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paperlessService = require('./paperlessService.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const historyService = require('./historyService.js');

const REVIEW_PATH = path.join(process.cwd(), 'data', '.review');
type ReviewConfig = Record<string, string>;
interface Metadata {
  title?: string | null;
  correspondent?: string | number | null;
  tags?: number[];
  document_type?: number | null;
  custom_fields?: unknown;
  owner?: number | null;
}
interface PatchResult {
  ok: boolean;
  error?: string;
  after?: { title?: string | null; correspondent?: string | null; tags?: number[] };
  diff?: object[];
}

function loadReviewConfig(): ReviewConfig {
  // Default: dry-run mode is on. Operators opt out by setting DRY_RUN=false.
  const defaults: ReviewConfig = { DRY_RUN: 'true' };
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

function writeReviewConfig(payload: ReviewConfig = {}) {
  fs.mkdirSync(path.dirname(REVIEW_PATH), { recursive: true });
  const merged = { ...loadReviewConfig(), ...payload };
  const body = [
    '# Tagvico AI dry-run review settings',
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
      } catch {
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
 * The PATCH is delegated to paperlessService.patchDocument, which returns
 * a structured diff; we persist the diff in the history table so the
 * history view can render it later.
 *
 * @param {number|string} documentId
 * @param {object} metadata
 * @returns {Promise<{ok: boolean, reason?: string, dryRun: boolean,
 *   diff?: Array<object>}>}
 */
async function applyMetadata(documentId: number | string, metadata: Metadata = {}) {
  if (!documentId) {
    return { ok: false, reason: 'documentId is required', dryRun: isDryRunEnabled() };
  }

  if (isDryRunEnabled()) {
    return { ok: false, reason: 'DRY_RUN is enabled; enable writes in /settings', dryRun: true };
  }

  if (typeof paperlessService.patchDocument !== 'function') {
    return { ok: false, reason: 'paperlessService.patchDocument not implemented', dryRun: false };
  }

  const result: PatchResult = await paperlessService.patchDocument(documentId, metadata);
  if (!result.ok) {
    return { ok: false, reason: result.error || 'patch failed', dryRun: false };
  }

  // Persist the diff alongside the regular history row so the UI can show
  // it. We do not log the document body — only field names and ids.
  const title = metadata.title || (result.after && result.after.title) || null;
  const correspondent = metadata.correspondent
    ? String(metadata.correspondent)
    : (result.after && result.after.correspondent) || null;
  historyService.addToHistory(
    documentId,
    metadata.tags || (result.after && result.after.tags) || [],
    title === null ? '' : title,
    correspondent === null ? '' : correspondent,
    result.diff || []
  );

  return { ok: true, dryRun: false, diff: result.diff || [] };
}

module.exports = {
  REVIEW_PATH,
  loadReviewConfig,
  writeReviewConfig,
  isDryRunEnabled,
  listRecentAnalyses,
  applyMetadata
};
