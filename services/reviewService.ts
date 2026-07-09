// @ts-nocheck — legacy module; tracked for strict typing.
//
// Durable, SQLite-backed dry-run review queue. A scanner reserves a row before
// calling an AI provider, stages the resulting proposal locally, and never
// reaches a Paperless write path until an authenticated person explicitly
// applies that proposal.

const fs = require('fs');
const path = require('path');
const documentModel = require('../models/document.js');
const paperlessService = require('./paperlessService.js');
const historyService = require('./historyService.js');
const config = require('../config/config.js');
const controlledTaggingService = require('./controlledTaggingService.js');
const tagGroupService = require('./tagGroupService.js');
const customFieldsService = require('./customFieldsService.js');
const ownerProfileService = require('./ownerProfileService.js');
const { compareMetadata } = require('./metadataDiff.js');

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
    '# Tagvico AI dry-run review settings',
    '# DRY_RUN=true (default) means new AI suggestions land in the review queue',
    '# instead of being written back to Paperless-ngx automatically.'
  ];
  for (const [key, value] of Object.entries(merged)) body.push(`${key}=${value}`);
  fs.writeFileSync(REVIEW_PATH, `${body.join('\n')}\n`);
  return merged;
}

function isEnabled(value) {
  return ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function isDryRunEnabled() {
  // An explicitly injected environment variable is useful for container
  // deployments and test stacks. Otherwise the persisted settings value is
  // authoritative and can be changed from the setup page without a restart.
  if (Object.prototype.hasOwnProperty.call(process.env, 'DRY_RUN')) {
    return isEnabled(process.env.DRY_RUN);
  }
  return isEnabled(loadReviewConfig().DRY_RUN || 'true');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function parseSuggestion(row) {
  if (!row) return null;
  return {
    ...row,
    proposed_metadata: parseJson(row.proposed_metadata, {}),
    original_metadata: parseJson(row.original_metadata, {}),
    diff: parseJson(row.diff, []),
    analysis_metrics: parseJson(row.analysis_metrics, null)
  };
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Return the update a human will review without resolving AI-generated names
 * into Paperless ids. Resolution can create Paperless tags, correspondents,
 * and document types, so it intentionally happens only in applySuggestion.
 */
async function buildSuggestionProposal(analysis = {}, doc = {}, content = '') {
  const suggested = analysis?.document || {};
  const proposal = {};

  if (config.limitFunctions?.activateTagging !== 'no') {
    // Keep the same controlled-tag vocabulary as the automatic write path,
    // but do not create/resolve anything while staging.
    proposal.tags = tagGroupService.enforceSuggestions(suggested.tags).valid;
  } else if (config.addAIProcessedTag === 'yes') {
    proposal.tags = tagGroupService.cleanTags(config.addAIProcessedTags.split(','));
  }

  if (config.limitFunctions?.activateTitle !== 'no') {
    proposal.title = cleanText(suggested.title) || cleanText(doc.title);
  }

  const proposedDate = cleanText(suggested.document_date) || cleanText(doc.created);
  if (proposedDate) proposal.created = proposedDate;

  if (config.limitFunctions?.activateDocumentType !== 'no') {
    const documentType = cleanText(suggested.document_type);
    if (documentType) proposal.document_type = documentType;
  }

  if (config.limitFunctions?.activateCustomFields !== 'no' && suggested.custom_fields) {
    proposal.custom_fields = suggested.custom_fields;
  }

  if (config.limitFunctions?.activateCorrespondents !== 'no') {
    const correspondent = cleanText(suggested.correspondent);
    if (correspondent) proposal.correspondent = correspondent;
  }

  const language = cleanText(suggested.language);
  if (language) proposal.language = language;

  if (config.activateOwnerAssignment !== 'no' && !doc.owner) {
    try {
      const users = await paperlessService.getUsers();
      const ownerMatch = ownerProfileService.findOwnerMatch({
        content,
        analysis,
        doc,
        users,
        rawProfiles: config.ownerProfiles
      });
      if (ownerMatch) proposal.owner = ownerMatch.id;
    } catch (error) {
      // Owner prediction is optional. A read failure must not discard an
      // otherwise useful suggestion.
      console.warn('[WARN] Could not prepare owner suggestion:', error.message);
    }
  }

  return proposal;
}

function previewMetadata(snapshot = {}, proposal = {}) {
  const before = {};
  for (const key of Object.keys(proposal || {})) before[key] = snapshot ? snapshot[key] : undefined;
  return before;
}

/**
 * Atomically reserve a slot before an AI request. A null return means a
 * previous automatic scan has already staged (or is staging) this document.
 */
async function reserveSuggestion(document, source = 'automatic') {
  const documentId = Number(document?.id || document?.document_id || document);
  if (!Number.isFinite(documentId) || documentId <= 0) return null;
  return documentModel.reserveReviewSuggestion(documentId, document?.title || null, source);
}

async function stageSuggestion(reservationId, { doc = {}, analysis = {}, originalData = {}, content = '' } = {}) {
  const proposal = await buildSuggestionProposal(analysis, doc, content);
  const diff = compareMetadata(previewMetadata(originalData, proposal), proposal);
  const staged = await documentModel.stageReviewSuggestion(reservationId, {
    title: proposal.title || doc.title || null,
    proposedMetadata: proposal,
    originalMetadata: originalData || {},
    diff,
    metrics: analysis.metrics || null
  });
  if (!staged) return null;

  // Cost accounting is local-only and remains useful even though no Paperless
  // document was changed in dry-run mode.
  if (analysis.metrics) {
    await documentModel.addOpenAIMetrics(
      staged.document_id,
      analysis.metrics.promptTokens || 0,
      analysis.metrics.completionTokens || 0,
      analysis.metrics.totalTokens || 0
    );
  }
  return parseSuggestion(staged);
}

async function failSuggestion(reservationId, error) {
  if (!reservationId) return false;
  return documentModel.failReviewSuggestion(reservationId, error);
}

async function listPendingSuggestions(limit = 50) {
  const rows = await documentModel.listPendingReviewSuggestions(limit);
  return rows.map(parseSuggestion);
}

function customFieldEntries(raw) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .map(([key, value]) => {
      if (!value || typeof value !== 'object') return null;
      const name = cleanText(value.field_name || value.name || key);
      if (!name || value.value === undefined) return null;
      return { name, value: value.value };
    })
    .filter(Boolean);
}

/**
 * Convert a stored, name-oriented proposal into the Paperless PATCH payload.
 * This is deliberately called only after a reviewer presses Apply.
 */
async function materializeProposal(documentId, proposal = {}) {
  const updateData = {};

  if (hasOwn(proposal, 'tags')) {
    const processed = await controlledTaggingService.processSuggestions(documentId, proposal.tags);
    updateData.tags = processed.tagIds || [];
  }

  if (hasOwn(proposal, 'title') && cleanText(proposal.title)) {
    const title = cleanText(proposal.title);
    updateData.title = title.length > 128 ? `${title.slice(0, 124)}…` : title;
  }

  if (hasOwn(proposal, 'created') && cleanText(proposal.created)) {
    updateData.created = cleanText(proposal.created);
  }

  if (hasOwn(proposal, 'document_type') && cleanText(proposal.document_type)) {
    const documentType = await paperlessService.getOrCreateDocumentType(cleanText(proposal.document_type));
    if (documentType?.id) updateData.document_type = documentType.id;
  }

  if (hasOwn(proposal, 'custom_fields')) {
    const liveFields = await customFieldsService.listFields();
    const { valid } = customFieldsService.sanitize(liveFields, proposal.custom_fields);
    const fieldsByName = new Map((liveFields || []).map((field) => [String(field.name).toLowerCase(), field]));
    const existing = await paperlessService.getExistingCustomFields(documentId);
    const byId = new Map();

    for (const current of existing || []) {
      if (current && current.field !== undefined) byId.set(Number(current.field), current);
    }
    for (const entry of customFieldEntries(proposal.custom_fields)) {
      const field = fieldsByName.get(entry.name.toLowerCase())
        || await paperlessService.findExistingCustomField(entry.name);
      if (!field?.id || !Object.prototype.hasOwnProperty.call(valid, field.name)) continue;
      byId.set(Number(field.id), { field: field.id, value: valid[field.name] });
    }
    if (byId.size > 0) updateData.custom_fields = [...byId.values()];
  }

  if (hasOwn(proposal, 'correspondent') && cleanText(proposal.correspondent)) {
    const correspondent = await paperlessService.getOrCreateCorrespondent(
      cleanText(proposal.correspondent),
      { restrictToExistingCorrespondents: config.restrictToExistingCorrespondents === 'yes' }
    );
    if (correspondent?.id) updateData.correspondent = correspondent.id;
  }

  if (hasOwn(proposal, 'language') && cleanText(proposal.language)) {
    updateData.language = cleanText(proposal.language);
  }

  if (hasOwn(proposal, 'owner') && proposal.owner !== null && proposal.owner !== undefined) {
    updateData.owner = proposal.owner;
  }

  return updateData;
}

async function mergeWithCurrentDocument(documentId, updateData = {}) {
  const current = await paperlessService.getDocument(documentId);
  const patch = { ...updateData };

  // Match the existing automatic write semantics: add proposed tags instead
  // of clobbering the user's current tags, and retain an existing correspondent.
  if (Array.isArray(patch.tags)) {
    patch.tags = [...new Set([...(current?.tags || []), ...patch.tags])];
  }
  if (current?.correspondent && patch.correspondent) delete patch.correspondent;
  return patch;
}

/**
 * Apply an individual stored suggestion. This intentionally ignores DRY_RUN:
 * dry-run blocks automation, never an authenticated human's explicit action.
 */
async function applySuggestion(id, reviewedBy = null) {
  const suggestion = await documentModel.claimReviewSuggestionForApply(id, reviewedBy);
  if (!suggestion) return { ok: false, reason: 'Suggestion is no longer pending', status: 409 };

  const parsed = parseSuggestion(suggestion);
  let paperlessApplied = false;
  try {
    // Preserve the exact Paperless snapshot captured before inference. This is
    // local-only and makes rollback/history useful even if the process exits
    // immediately after Paperless accepts the patch.
    await documentModel.saveOriginalSnapshot(parsed.document_id, parsed.original_metadata || {});
    const resolved = await materializeProposal(parsed.document_id, parsed.proposed_metadata);
    const patch = await mergeWithCurrentDocument(parsed.document_id, resolved);
    const result = await paperlessService.patchDocument(parsed.document_id, patch);
    if (!result.ok) throw new Error(result.error || 'Paperless patch failed');
    paperlessApplied = true;

    const historyTags = Array.isArray(patch.tags) ? patch.tags : (result.after?.tags || []);
    const historyTitle = patch.title || result.after?.title || parsed.title || null;
    const historyCorrespondent = patch.correspondent || result.after?.correspondent || null;
    historyService.addToHistory(
      parsed.document_id,
      historyTags,
      historyTitle,
      historyCorrespondent,
      result.diff || []
    );
    const completed = await documentModel.completeReviewSuggestion(id, {
      diff: result.diff || [],
      reviewedBy
    });
    if (!completed) {
      // The Paperless mutation already succeeded, so this must never release
      // the row to pending and risk a duplicate apply.
      return {
        ok: false,
        reason: 'Paperless was updated, but the local review state could not be finalized',
        status: 500
      };
    }
    return {
      ok: true,
      suggestion: { ...parsed, status: 'applied', diff: result.diff || [] },
      diff: result.diff || []
    };
  } catch (error) {
    if (!paperlessApplied) {
      await documentModel.releaseReviewSuggestionAfterApplyFailure(id, error.message || error);
    }
    return {
      ok: false,
      reason: paperlessApplied
        ? `Paperless was updated, but local finalization failed: ${error.message || String(error)}`
        : (error.message || String(error)),
      status: paperlessApplied ? 500 : 502
    };
  }
}

async function rejectSuggestion(id, reviewedBy = null, note = null) {
  const rejected = await documentModel.rejectReviewSuggestion(id, reviewedBy, note);
  if (!rejected) return { ok: false, reason: 'Suggestion is no longer pending', status: 409 };
  return { ok: true, suggestion: parseSuggestion(rejected) };
}

// Kept for compatibility with callers that explicitly submit a manual patch.
// It is an explicit user action, so DRY_RUN does not block it.
async function applyMetadata(documentId, metadata = {}) {
  if (!documentId) return { ok: false, reason: 'documentId is required', dryRun: isDryRunEnabled() };
  if (typeof paperlessService.patchDocument !== 'function') {
    return { ok: false, reason: 'paperlessService.patchDocument not implemented', dryRun: isDryRunEnabled() };
  }
  const result = await paperlessService.patchDocument(documentId, metadata);
  if (!result.ok) return { ok: false, reason: result.error || 'patch failed', dryRun: isDryRunEnabled() };
  historyService.addToHistory(
    documentId,
    metadata.tags || result.after?.tags || [],
    metadata.title || result.after?.title || null,
    metadata.correspondent || result.after?.correspondent || null,
    result.diff || []
  );
  return { ok: true, dryRun: isDryRunEnabled(), diff: result.diff || [] };
}

module.exports = {
  REVIEW_PATH,
  loadReviewConfig,
  writeReviewConfig,
  isDryRunEnabled,
  parseSuggestion,
  reserveSuggestion,
  stageSuggestion,
  failSuggestion,
  listPendingSuggestions,
  // Older route code called this method; it now deliberately reads the real
  // queue rather than projecting unrelated history rows.
  listRecentAnalyses: listPendingSuggestions,
  buildSuggestionProposal,
  materializeProposal,
  applySuggestion,
  rejectSuggestion,
  applyMetadata
};
