import crypto from 'node:crypto';
import documentModel from '../models/document';
import type {
  PaperlessTagSnapshot,
  TagUnificationStatus,
  TagUnificationSuggestion
} from '../contracts/tagUnification';

type RunInput = {
  providerInstanceId: string;
  modelId: string;
  tagSnapshotHash: string;
  tagsCount: number;
};

type SuggestionInput = {
  source: PaperlessTagSnapshot;
  target: PaperlessTagSnapshot;
  reason: string;
  confidence: number;
};

type SuggestionRow = Record<string, unknown>;

const db = documentModel.getDatabase();

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_unification_runs (
      id TEXT PRIMARY KEY,
      provider_instance_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'analyzing',
      tag_snapshot_hash TEXT NOT NULL,
      tags_count INTEGER NOT NULL,
      error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_tag_unification_runs_created
      ON tag_unification_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS tag_unification_suggestions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES tag_unification_runs(id) ON DELETE CASCADE,
      source_tag_id INTEGER NOT NULL,
      source_tag_name TEXT NOT NULL,
      source_document_count INTEGER NOT NULL DEFAULT 0,
      target_tag_id INTEGER NOT NULL,
      target_tag_name TEXT NOT NULL,
      target_document_count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested',
      current_phase TEXT,
      approved_by TEXT,
      rejected_by TEXT,
      last_error TEXT,
      phase_started_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(run_id, source_tag_id, target_tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tag_unification_suggestions_status
      ON tag_unification_suggestions(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS tag_unification_audit (
      id TEXT PRIMARY KEY,
      suggestion_id TEXT NOT NULL REFERENCES tag_unification_suggestions(id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      phase TEXT NOT NULL,
      action TEXT NOT NULL,
      document_id INTEGER,
      outcome TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tag_unification_audit_suggestion
      ON tag_unification_audit(suggestion_id, created_at);
  `);
}

function parseSuggestion(row: SuggestionRow): TagUnificationSuggestion {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    sourceTagId: Number(row.source_tag_id),
    sourceTagName: String(row.source_tag_name),
    sourceDocumentCount: Number(row.source_document_count),
    targetTagId: Number(row.target_tag_id),
    targetTagName: String(row.target_tag_name),
    targetDocumentCount: Number(row.target_document_count),
    reason: String(row.reason),
    confidence: Number(row.confidence),
    status: String(row.status) as TagUnificationStatus,
    currentPhase: row.current_phase === 'move' || row.current_phase === 'delete'
      ? row.current_phase
      : null,
    providerInstanceId: String(row.provider_instance_id),
    modelId: String(row.model_id),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function joinedSuggestion(id: string): TagUnificationSuggestion | null {
  migrate();
  const row = db.prepare(`
    SELECT s.*, r.provider_instance_id, r.model_id
    FROM tag_unification_suggestions s
    JOIN tag_unification_runs r ON r.id = s.run_id
    WHERE s.id = ?
  `).get(id) as SuggestionRow | undefined;
  return row ? parseSuggestion(row) : null;
}

function createRun(input: RunInput): string {
  migrate();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tag_unification_runs
      (id, provider_instance_id, model_id, tag_snapshot_hash, tags_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.providerInstanceId, input.modelId, input.tagSnapshotHash, input.tagsCount);
  return id;
}

function completeRun(runId: string, suggestions: SuggestionInput[]): TagUnificationSuggestion[] {
  migrate();
  const activeConflict = db.prepare(`
    SELECT 1
    FROM tag_unification_suggestions
    WHERE status IN ('suggested', 'approved', 'moving', 'moved', 'deleting', 'failed')
      AND (
        source_tag_id IN (?, ?)
        OR target_tag_id IN (?, ?)
      )
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO tag_unification_suggestions
      (id, run_id, source_tag_id, source_tag_name, source_document_count,
       target_tag_id, target_tag_name, target_document_count, reason, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const suggestion of suggestions) {
      if (activeConflict.get(
        suggestion.source.id,
        suggestion.target.id,
        suggestion.source.id,
        suggestion.target.id
      )) continue;
      insert.run(
        crypto.randomUUID(),
        runId,
        suggestion.source.id,
        suggestion.source.name,
        suggestion.source.documentCount,
        suggestion.target.id,
        suggestion.target.name,
        suggestion.target.documentCount,
        suggestion.reason,
        suggestion.confidence
      );
    }
    db.prepare(`
      UPDATE tag_unification_runs
      SET status = 'completed', finished_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'analyzing'
    `).run(runId);
  })();
  return list({ runId });
}

function failRun(runId: string, error: string) {
  migrate();
  db.prepare(`
    UPDATE tag_unification_runs
    SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(error, runId);
}

function list(filters: { runId?: string; limit?: number } = {}): TagUnificationSuggestion[] {
  migrate();
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];
  if (filters.runId) {
    conditions.push('s.run_id = ?');
    parameters.push(filters.runId);
  }
  const limit = Math.min(200, Math.max(1, filters.limit || 100));
  parameters.push(limit);
  const rows = db.prepare(`
    SELECT s.*, r.provider_instance_id, r.model_id
    FROM tag_unification_suggestions s
    JOIN tag_unification_runs r ON r.id = s.run_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY s.created_at DESC, s.confidence DESC
    LIMIT ?
  `).all(...parameters) as SuggestionRow[];
  return rows.map(parseSuggestion);
}

function decide(id: string, decision: 'approved' | 'rejected', actor: string): TagUnificationSuggestion | null {
  migrate();
  const actorColumn = decision === 'approved' ? 'approved_by' : 'rejected_by';
  db.prepare(`
    UPDATE tag_unification_suggestions
    SET status = ?, ${actorColumn} = ?, current_phase = NULL, last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'suggested'
  `).run(decision, actor, id);
  return joinedSuggestion(id);
}

function beginPhase(id: string, phase: 'move' | 'delete'): TagUnificationSuggestion | null {
  migrate();
  const allowedStatus = phase === 'move' ? 'approved' : 'moved';
  const runningStatus = phase === 'move' ? 'moving' : 'deleting';
  const transaction = db.transaction(() => {
    const current = joinedSuggestion(id);
    if (!current) return null;
    if (phase === 'move' && ['moved', 'completed'].includes(current.status)) return current;
    if (phase === 'delete' && current.status === 'completed') return current;
    const retryingSamePhase = current.status === 'failed' && current.currentPhase === phase;
    if (current.status !== allowedStatus && !retryingSamePhase) {
      throw new Error(
        phase === 'move'
          ? 'Approve this suggestion before moving documents.'
          : 'Move all documents before deleting the source tag.'
      );
    }
    const result = db.prepare(`
      UPDATE tag_unification_suggestions
      SET status = ?, current_phase = ?, last_error = NULL,
          phase_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `).run(runningStatus, phase, id, current.status);
    if (result.changes !== 1) throw new Error('This unification phase is already running.');
    return joinedSuggestion(id);
  });
  return transaction();
}

function finishPhase(id: string, phase: 'move' | 'delete'): TagUnificationSuggestion | null {
  migrate();
  const expected = phase === 'move' ? 'moving' : 'deleting';
  const next = phase === 'move' ? 'moved' : 'completed';
  db.prepare(`
    UPDATE tag_unification_suggestions
    SET status = ?, current_phase = ?, last_error = NULL,
        phase_started_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `).run(next, phase, id, expected);
  return joinedSuggestion(id);
}

function failPhase(id: string, phase: 'move' | 'delete', error: string): TagUnificationSuggestion | null {
  migrate();
  db.prepare(`
    UPDATE tag_unification_suggestions
    SET status = 'failed', current_phase = ?, last_error = ?,
        phase_started_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('moving', 'deleting')
  `).run(phase, error, id);
  return joinedSuggestion(id);
}

function audit(input: {
  suggestionId: string;
  actor: string;
  phase: 'move' | 'delete' | 'decision';
  action: string;
  documentId?: number;
  outcome: 'success' | 'skipped' | 'failed';
  payload?: unknown;
  error?: string;
}) {
  migrate();
  db.prepare(`
    INSERT INTO tag_unification_audit
      (id, suggestion_id, actor, phase, action, document_id, outcome, payload_json, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    input.suggestionId,
    input.actor,
    input.phase,
    input.action,
    input.documentId || null,
    input.outcome,
    JSON.stringify(input.payload ?? {}),
    input.error || null
  );
}

function auditTrail(suggestionId: string) {
  migrate();
  return db.prepare(`
    SELECT id, actor, phase, action, document_id AS documentId, outcome,
      payload_json AS payloadJson, error, created_at AS createdAt
    FROM tag_unification_audit
    WHERE suggestion_id = ?
    ORDER BY created_at, id
  `).all(suggestionId);
}

const tagUnificationStore = {
  audit,
  auditTrail,
  beginPhase,
  completeRun,
  createRun,
  decide,
  failPhase,
  failRun,
  finishPhase,
  get: joinedSuggestion,
  list,
  migrate
};

export default tagUnificationStore;
module.exports = tagUnificationStore;
