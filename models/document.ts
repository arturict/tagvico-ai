// models/document.js
const Database = require('better-sqlite3');
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { resolveDataDirectory } from '../services/dataDirectory';

// Ensure data directory exists
const dataDir = resolveDataDirectory();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database with WAL mode for better performance
const databasePath = path.join(dataDir, 'documents.db');
const db = new Database(databasePath, {
  timeout: 30000
});
db.pragma('busy_timeout = 30000');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface OriginalSnapshot {
  title?: string | null;
  tags?: unknown;
  correspondent?: string | number | null;
  document_type?: string | number | null;
  created?: string | null;
  document_date?: string | null;
  language?: string | null;
  custom_fields?: unknown;
  owner?: string | number | null;
}

interface ReviewStageOptions {
  title?: string | null;
  proposedMetadata?: Record<string, unknown>;
  originalMetadata?: Record<string, unknown>;
  diff?: unknown[];
  metrics?: Record<string, unknown> | null;
}

interface ReviewSuggestionRow {
  document_id: number;
  title: string | null;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const columnExists = (table: string, column: string): boolean =>
  db.prepare(`PRAGMA table_info(${table})`).all()
    .some((entry: { name: string }) => entry.name === column);

const MIGRATIONS = [
  {
    version: 1,
    up() {
      if (!columnExists('original_documents', 'document_type')) db.exec('ALTER TABLE original_documents ADD COLUMN document_type INTEGER');
      if (!columnExists('original_documents', 'document_date')) db.exec('ALTER TABLE original_documents ADD COLUMN document_date TEXT');
      if (!columnExists('original_documents', 'language')) db.exec('ALTER TABLE original_documents ADD COLUMN language TEXT');
      if (!columnExists('original_documents', 'custom_fields')) db.exec("ALTER TABLE original_documents ADD COLUMN custom_fields TEXT DEFAULT '[]'");
      if (!columnExists('original_documents', 'owner')) db.exec('ALTER TABLE original_documents ADD COLUMN owner INTEGER');
      if (!columnExists('original_documents', 'snapshot_json')) db.exec("ALTER TABLE original_documents ADD COLUMN snapshot_json TEXT DEFAULT '{}'");
      if (!columnExists('history_documents', 'event_type')) db.exec("ALTER TABLE history_documents ADD COLUMN event_type TEXT DEFAULT 'processed'");
      if (!columnExists('history_documents', 'source')) db.exec("ALTER TABLE history_documents ADD COLUMN source TEXT DEFAULT 'automatic'");
      db.exec(`
        DELETE FROM original_documents
        WHERE id NOT IN (SELECT MIN(id) FROM original_documents GROUP BY document_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_original_document_id ON original_documents(document_id);
      `);
    }
  },
  {
    version: 2,
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ocr_queue (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL UNIQUE,
          title TEXT,
          reason TEXT NOT NULL DEFAULT 'manual',
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          ocr_text TEXT,
          last_error TEXT,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          processed_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_ocr_queue_status ON ocr_queue(status, added_at DESC);
        CREATE TABLE IF NOT EXISTS failed_documents (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL UNIQUE,
          title TEXT,
          failed_reason TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'ai',
          attempts INTEGER NOT NULL DEFAULT 1,
          last_error TEXT,
          failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_failed_documents_updated ON failed_documents(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_created ON history_documents(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_document ON history_documents(document_id, created_at DESC);
      `);
    }
  },
  {
    version: 3,
    up() {
      if (!columnExists('users', 'mfa_enabled')) db.exec('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0');
      if (!columnExists('users', 'mfa_secret')) db.exec('ALTER TABLE users ADD COLUMN mfa_secret TEXT');
    }
  },
  {
    version: 4,
    up() {
      // A suggestion starts as `staging` before an AI request is made. That
      // reservation prevents a second scanner from paying to analyze the same
      // document while the first scanner is still working. Once the model has
      // returned, the row becomes `pending` and is visible to a human reviewer.
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_suggestions (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL,
          source TEXT NOT NULL DEFAULT 'automatic',
          status TEXT NOT NULL DEFAULT 'staging',
          title TEXT,
          proposed_metadata TEXT NOT NULL DEFAULT '{}',
          original_metadata TEXT,
          diff TEXT,
          analysis_metrics TEXT,
          reviewed_by TEXT,
          review_note TEXT,
          last_error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          staged_at DATETIME,
          reviewed_at DATETIME,
          applied_at DATETIME,
          rejected_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_review_suggestions_pending
          ON review_suggestions(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_review_suggestions_document
          ON review_suggestions(document_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_review_suggestions_active_document
          ON review_suggestions(document_id)
          WHERE status IN ('staging', 'pending', 'applying');
      `);
    }
  },
  {
    version: 5,
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS households (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'solo' CHECK (kind IN ('solo', 'family')),
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS household_members (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'adult' CHECK (role IN ('owner', 'adult', 'member', 'viewer')),
          paperless_user_id INTEGER,
          paperless_token_encrypted TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(household_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id, active);

        CREATE TABLE IF NOT EXISTS action_cases (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          paperless_document_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('suggested', 'open', 'waiting', 'done', 'dismissed')),
          priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          due_at DATETIME,
          assignee_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
          source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'paperless', 'telegram')),
          confidence REAL,
          paperless_fingerprint TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'conflict', 'error')),
          sync_error TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_synced_at DATETIME,
          UNIQUE(household_id, paperless_document_id)
        );
        CREATE INDEX IF NOT EXISTS idx_action_cases_household_status ON action_cases(household_id, status, due_at);
        CREATE INDEX IF NOT EXISTS idx_action_cases_document ON action_cases(paperless_document_id);

        CREATE TABLE IF NOT EXISTS action_steps (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL REFERENCES action_cases(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
          due_at DATETIME,
          position INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_action_steps_case ON action_steps(case_id, position);

        CREATE TABLE IF NOT EXISTS action_events (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL REFERENCES action_cases(id) ON DELETE CASCADE,
          actor_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_action_events_case ON action_events(case_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS companion_sessions (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
          channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram')),
          title TEXT NOT NULL DEFAULT 'New conversation',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS companion_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES companion_sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content_json TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_companion_messages_session ON companion_messages(session_id, created_at);

        CREATE TABLE IF NOT EXISTS agent_approvals (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          session_id TEXT REFERENCES companion_sessions(id) ON DELETE SET NULL,
          requested_by_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
          action_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
          result_json TEXT,
          decided_by_member_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          decided_at DATETIME,
          executed_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending ON agent_approvals(household_id, status, created_at DESC);
      `);
    }
  },
  {
    version: 6,
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tag_unification_runs (
          id TEXT PRIMARY KEY,
          provider_instance_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'analyzing'
            CHECK (status IN ('analyzing', 'completed', 'failed')),
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
          confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          status TEXT NOT NULL DEFAULT 'suggested'
            CHECK (status IN ('suggested', 'approved', 'rejected', 'moving', 'moved', 'deleting', 'completed', 'failed')),
          current_phase TEXT CHECK (current_phase IS NULL OR current_phase IN ('move', 'delete')),
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
          phase TEXT NOT NULL CHECK (phase IN ('decision', 'move', 'delete')),
          action TEXT NOT NULL,
          document_id INTEGER,
          outcome TEXT NOT NULL CHECK (outcome IN ('success', 'skipped', 'failed')),
          payload_json TEXT NOT NULL DEFAULT '{}',
          error TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tag_unification_audit_suggestion
          ON tag_unification_audit(suggestion_id, created_at);
      `);
    }
  },
  {
    version: 7,
    up() {
      if (!columnExists('history_documents', 'metadata_json')) {
        db.exec("ALTER TABLE history_documents ADD COLUMN metadata_json TEXT DEFAULT '{}'");
      }
      if (!columnExists('history_documents', 'metrics_json')) {
        db.exec("ALTER TABLE history_documents ADD COLUMN metrics_json TEXT DEFAULT '{}'");
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS ignored_documents (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL UNIQUE,
          title TEXT,
          reason TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ignored_documents_updated
          ON ignored_documents(updated_at DESC);

        CREATE TABLE IF NOT EXISTS rescan_requests (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL UNIQUE,
          requested_by TEXT NOT NULL DEFAULT 'history',
          requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_rescan_requests_requested
          ON rescan_requests(requested_at);
      `);
    }
  }
];

function runMigrations() {
  const current = Number(db.pragma('user_version', { simple: true })) || 0;
  const pending = MIGRATIONS.filter((entry) => entry.version > current);
  const disposableDataDirectory = process.env.TAGVICO_BUILD_DATA_ROOT || process.env.TAGVICO_TEST_DATA_ROOT;
  if (pending.length > 0 && fs.existsSync(databasePath) && !disposableDataDirectory) {
    const backupPath = `${databasePath}.pre-migration-v${current}-${Date.now()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}.bak`;
    // VACUUM INTO creates a consistent standalone snapshot, including data that
    // still lives in the WAL. Copying only the main file can silently lose it.
    db.prepare('VACUUM INTO ?').run(backupPath);
    console.log(`[DB] Created pre-migration backup at ${backupPath}`);
  }

  db.exec('BEGIN IMMEDIATE');
  const appliedVersions: number[] = [];
  try {
    const lockedVersion = Number(db.pragma('user_version', { simple: true })) || 0;
    for (const migration of MIGRATIONS.filter((entry) => entry.version > lockedVersion)) {
      migration.up();
      db.pragma(`user_version = ${migration.version}`);
      appliedVersions.push(migration.version);
    }
    db.exec('COMMIT');
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw error;
  }
  if (!disposableDataDirectory) {
    for (const version of appliedVersions) {
      console.log(`[DB] Applied migration ${version}`);
    }
  }
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_documents (
      id INTEGER PRIMARY KEY,
      document_id INTEGER UNIQUE,
      title TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS openai_metrics (
      id INTEGER PRIMARY KEY,
      document_id INTEGER,
      promptTokens INTEGER,
      completionTokens INTEGER,
      totalTokens INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS history_documents (
      id INTEGER PRIMARY KEY,
      document_id INTEGER,
      tags TEXT,
      title TEXT,
      correspondent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS original_documents (
      id INTEGER PRIMARY KEY,
      document_id INTEGER,
      title TEXT,
      tags TEXT,
      correspondent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS processing_status (
      id INTEGER PRIMARY KEY,
      document_id INTEGER UNIQUE,
      title TEXT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT
    );
  `);
  runMigrations();
}

function initializeSchemaWithProcessLock() {
  const lockDatabase = new Database(`${databasePath}.migration-lock`, { timeout: 30000 });
  lockDatabase.pragma('busy_timeout = 30000');
  try {
    lockDatabase.exec('CREATE TABLE IF NOT EXISTS migration_lock (id INTEGER PRIMARY KEY CHECK (id = 1))');
    lockDatabase.exec('BEGIN EXCLUSIVE');
    try {
      initializeSchema();
      lockDatabase.exec('COMMIT');
    } catch (error) {
      if (lockDatabase.inTransaction) lockDatabase.exec('ROLLBACK');
      throw error;
    }
  } finally {
    lockDatabase.close();
  }
}

initializeSchemaWithProcessLock();
db.pragma('busy_timeout = 5000');


// Prepare statements for better performance
const insertDocument = db.prepare(`
  INSERT INTO processed_documents (document_id, title) 
  VALUES (?, ?)
  ON CONFLICT(document_id) DO UPDATE SET
    last_updated = CURRENT_TIMESTAMP
  WHERE document_id = ?
`);

const findDocument = db.prepare(
  'SELECT * FROM processed_documents WHERE document_id = ?'
);

const insertMetrics = db.prepare(`
  INSERT INTO openai_metrics (document_id, promptTokens, completionTokens, totalTokens)
  VALUES (?, ?, ?, ?)
`);

const insertUser = db.prepare(`
  INSERT INTO users (username, password)
  VALUES (?, ?)
`);

// Add these prepared statements with your other ones at the top
const getHistoryDocumentsCount = db.prepare(`
  SELECT COUNT(*) as count FROM history_documents
`);

const getPaginatedHistoryDocuments = db.prepare(`
  SELECT * FROM history_documents 
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`);

// An `applying` claim belongs to the previous process. If it exited before
// finalizing the row, return the suggestion to the visible review queue so it
// can be retried explicitly instead of blocking the document forever.
function recoverApplyingReviewSuggestions() {
  return db.prepare(`
    UPDATE review_suggestions
    SET status = 'pending',
        last_error = COALESCE(last_error, 'Apply interrupted; returned to review queue'),
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'applying'
  `).run().changes;
}
// Add with your other prepared statements
const upsertProcessingStatus = db.prepare(`
  INSERT INTO processing_status (document_id, title, status)
  VALUES (?, ?, ?)
  ON CONFLICT(document_id) DO UPDATE SET
    status = excluded.status,
    start_time = CURRENT_TIMESTAMP
  WHERE document_id = excluded.document_id
`);

const clearProcessingStatus = db.prepare(`
  DELETE FROM processing_status WHERE document_id = ?
`);

const getActiveProcessing = db.prepare(`
  SELECT * FROM processing_status 
  WHERE start_time >= datetime('now', '-30 seconds')
  ORDER BY start_time DESC LIMIT 1
`);


const documentModel = {
  getDatabase() {
    return db;
  },

  getSchemaVersion() {
    return Number(db.pragma('user_version', { simple: true })) || 0;
  },

  async backupDatabase(targetPath: string) {
    await db.backup(targetPath);
    return targetPath;
  },

  async addProcessedDocument(documentId: number, title: string) {
    try {
      // Bei UNIQUE constraint failure wird der existierende Eintrag aktualisiert
      const result = insertDocument.run(documentId, title, documentId);
      if (result.changes > 0) {
        console.log(`[DEBUG] Document ${title} ${result.lastInsertRowid ? 'added to' : 'updated in'} processed_documents`);
        return true;
      }
      return false;
    } catch (error) {
      // Log error but don't throw
      console.error('[ERROR] adding document:', error);
      return false;
    }
  },

  async addOpenAIMetrics(documentId: number, promptTokens: number, completionTokens: number, totalTokens: number) {
    try {
      const result = insertMetrics.run(documentId, promptTokens, completionTokens, totalTokens);
      if (result.changes > 0) {
        console.log(`[DEBUG] Metrics added for document ${documentId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] adding metrics:', error);
      return false;
    }
  },

  async getMetrics() {
    try {
      return db.prepare('SELECT * FROM openai_metrics').all();
    } catch (error) {
      console.error('[ERROR] getting metrics:', error);
      return [];
    }
  },

  async getProcessedDocuments() {
    try {
      return db.prepare('SELECT * FROM processed_documents').all();
    } catch (error) {
      console.error('[ERROR] getting processed documents:', error);
      return [];
    }
  },

  async getProcessedDocumentsCount() {
    try {
      return db.prepare('SELECT COUNT(*) FROM processed_documents').pluck().get();
    } catch (error) {
      console.error('[ERROR] getting processed documents count:', error);
      return 0;
    }
  },

  async isDocumentProcessed(documentId: number) {
    try {
      const row = findDocument.get(documentId);
      return !!row;
    } catch (error) {
      console.error('[ERROR] checking document:', error);
      // Im Zweifelsfall true zurückgeben, um doppelte Verarbeitung zu vermeiden
      return true;
    }
  },

  /**
   * Reserve a document before an automatic dry-run sends it to a model. The
   * partial unique index created by migration 4 makes this atomic across
   * concurrent scanner processes, so a pending review cannot be charged for a
   * second analysis.
   */
  async reserveReviewSuggestion(documentId: number, title: string | null = null, source = 'automatic') {
    try {
      // A process can die after reserving a row but before it has a proposal to
      // show. Release only old reservations; a live scanner remains protected.
      db.prepare(`
        UPDATE review_suggestions
        SET status = 'failed',
            last_error = COALESCE(last_error, 'staging interrupted before a suggestion was saved'),
            updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ?
          AND status = 'staging'
          AND datetime(updated_at) < datetime('now', '-30 minutes')
      `).run(documentId);

      const result = db.prepare(`
        INSERT INTO review_suggestions (document_id, source, status, title)
        VALUES (?, ?, 'staging', ?)
      `).run(documentId, source || 'automatic', title || null);
      return db.prepare('SELECT * FROM review_suggestions WHERE id = ?').get(result.lastInsertRowid);
    } catch (error) {
      // An active staging/pending/applying row is expected when the scheduler
      // sees a document again. It is deliberately not an error condition.
      if (errorMessage(error).includes('UNIQUE constraint failed')) return null;
      console.error('[ERROR] reserving review suggestion:', error);
      throw error;
    }
  },

  async hasActiveReviewSuggestion(documentId: number) {
    return Boolean(db.prepare(`
      SELECT 1 FROM review_suggestions
      WHERE document_id = ? AND status IN ('staging', 'pending', 'applying')
      LIMIT 1
    `).get(documentId));
  },

  async recoverApplyingReviewSuggestions() {
    return recoverApplyingReviewSuggestions();
  },

  async stageReviewSuggestion(id: number, {
    title = null,
    proposedMetadata = {},
    originalMetadata = {},
    diff = [],
    metrics = null
  }: ReviewStageOptions = {}) {
    const result = db.prepare(`
      UPDATE review_suggestions
      SET status = 'pending',
          title = ?,
          proposed_metadata = ?,
          original_metadata = ?,
          diff = ?,
          analysis_metrics = ?,
          last_error = NULL,
          staged_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'staging'
    `).run(
      title || null,
      JSON.stringify(proposedMetadata || {}),
      JSON.stringify(originalMetadata || {}),
      JSON.stringify(diff || []),
      metrics == null ? null : JSON.stringify(metrics),
      id
    );
    if (result.changes === 0) return null;
    return db.prepare('SELECT * FROM review_suggestions WHERE id = ?').get(id);
  },

  async failReviewSuggestion(id: number, error: unknown) {
    return db.prepare(`
      UPDATE review_suggestions
      SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('staging', 'applying')
    `).run(String(error || 'review suggestion failed'), id).changes > 0;
  },

  async listPendingReviewSuggestions(limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return db.prepare(`
      SELECT * FROM review_suggestions
      WHERE status = 'pending'
      ORDER BY datetime(staged_at) DESC, id DESC
      LIMIT ?
    `).all(safeLimit);
  },

  async getReviewSuggestion(id: number) {
    return db.prepare('SELECT * FROM review_suggestions WHERE id = ?').get(id) || null;
  },

  async claimReviewSuggestionForApply(id: number, reviewedBy: string | null = null) {
    const result = db.prepare(`
      UPDATE review_suggestions
      SET status = 'applying',
          reviewed_by = COALESCE(?, reviewed_by),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(reviewedBy || null, id);
    if (result.changes === 0) return null;
    return db.prepare('SELECT * FROM review_suggestions WHERE id = ?').get(id) || null;
  },

  async completeReviewSuggestion(id: number, { diff = [], reviewedBy = null }: { diff?: unknown[]; reviewedBy?: string | null } = {}) {
    return db.transaction(() => {
      const result = db.prepare(`
        UPDATE review_suggestions
        SET status = 'applied',
            diff = ?,
            reviewed_by = COALESCE(?, reviewed_by),
            reviewed_at = CURRENT_TIMESTAMP,
            applied_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'applying'
      `).run(JSON.stringify(diff || []), reviewedBy || null, id);
      if (result.changes === 0) return false;

      // Closing a review is also the scanner's durable acknowledgement that
      // this document has been handled. Keep both writes in one transaction so
      // a scheduler cannot reserve a fresh inference between them.
      const suggestion = db.prepare(`
        SELECT document_id, title FROM review_suggestions WHERE id = ?
      `).get(id) as ReviewSuggestionRow;
      insertDocument.run(
        suggestion.document_id,
        suggestion.title || `Document ${suggestion.document_id}`,
        suggestion.document_id
      );
      return true;
    })();
  },

  async releaseReviewSuggestionAfterApplyFailure(id: number, error: unknown) {
    return db.prepare(`
      UPDATE review_suggestions
      SET status = 'pending', last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'applying'
    `).run(String(error || 'failed to apply review suggestion'), id).changes > 0;
  },

  async rejectReviewSuggestion(id: number, reviewedBy: string | null = null, note: string | null = null) {
    return db.transaction(() => {
      const result = db.prepare(`
        UPDATE review_suggestions
        SET status = 'rejected',
            reviewed_by = COALESCE(?, reviewed_by),
            review_note = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            rejected_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(reviewedBy || null, note || null, id);
      if (result.changes === 0) return null;

      const suggestion = db.prepare(`
        SELECT * FROM review_suggestions WHERE id = ?
      `).get(id) as ReviewSuggestionRow;
      insertDocument.run(
        suggestion.document_id,
        suggestion.title || `Document ${suggestion.document_id}`,
        suggestion.document_id
      );
      return suggestion;
    })();
  },

  async saveOriginalData(documentId: number, tags: unknown, correspondent: string | null, title: string) {
    try {
      const tagsString = JSON.stringify(tags); // Konvertiere Array zu String
      const result = db.prepare(`
        INSERT INTO original_documents (document_id, title, tags, correspondent)
        VALUES (?, ?, ?, ?)
      `).run(documentId, title, tagsString, correspondent);
      if (result.changes > 0) {
        console.log(`[DEBUG] Original data for document ${title} saved`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] saving original data:', error);
      return false;
    }
  },

  async saveOriginalSnapshot(documentId: number, snapshot: OriginalSnapshot = {}) {
    const tags = JSON.stringify(snapshot.tags || []);
    const customFields = JSON.stringify(snapshot.custom_fields || []);
    const snapshotJson = JSON.stringify(snapshot);
    const result = db.prepare(`
      INSERT INTO original_documents
        (document_id, title, tags, correspondent, document_type, document_date, language, custom_fields, owner, snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO NOTHING
    `).run(
      documentId,
      snapshot.title || null,
      tags,
      snapshot.correspondent ?? null,
      snapshot.document_type ?? null,
      snapshot.created || snapshot.document_date || null,
      snapshot.language || null,
      customFields,
      snapshot.owner ?? null,
      snapshotJson
    );
    return result.changes > 0;
  },

  async addToHistory(documentId: number, tagIds: unknown, title: string, correspondent: string | null) {
    try {
      const tagIdsString = JSON.stringify(tagIds); // Konvertiere Array zu String
      const result = db.prepare(`
        INSERT INTO history_documents (document_id, tags, title, correspondent)
        VALUES (?, ?, ?, ?)
      `).run(documentId, tagIdsString, title, correspondent);
      if (result.changes > 0) {
        console.log(`[DEBUG] Document ${title} added to history`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] adding to history:', error);
      return false;
    }
  },

  async getHistory(id?: number) {
    //check if id is provided else get all history
    if (id) {
      try {
        //only one document with id exists
        return db.prepare('SELECT * FROM history_documents WHERE document_id = ?').get(id);
      } catch (error) {
        console.error('[ERROR] getting history for id:', id, error);
        return [];
      }
    } else {
      try {
        return db.prepare('SELECT * FROM history_documents').all();
      } catch (error) {
        console.error('[ERROR] getting history for id:', id, error);
        return [];
      }
    }
  },

  async getOriginalData(id?: number) {
    //check if id is provided else get all original data
    if (id) {
      try {
        //only one document with id exists
        return db.prepare('SELECT * FROM original_documents WHERE document_id = ?').get(id);
      } catch (error) {
        console.error('[ERROR] getting original data for id:', id, error);
        return [];
      }
    } else {
      try {
        return db.prepare('SELECT * FROM original_documents').all();
      } catch (error) {
        console.error('[ERROR] getting original data for id:', id, error);
        return [];
      }
    }
  },

  async getAllOriginalData() {
    try {
      return db.prepare('SELECT * FROM original_documents').all();
    } catch (error) {
      console.error('[ERROR] getting original data:', error);
      return [];
    }
  },

  async getAllHistory() {
    try {
      return db.prepare('SELECT * FROM history_documents').all();
    } catch (error) {
      console.error('[ERROR] getting history:', error);
      return [];
    }
  },

  async getHistoryDocumentsCount() {
    try {
      const result = getHistoryDocumentsCount.get();
      return result.count;
    } catch (error) {
      console.error('[ERROR] getting history documents count:', error);
      return 0;
    }
  },
  
  async getPaginatedHistory(limit: number, offset: number) {
    try {
      return getPaginatedHistoryDocuments.all(limit, offset);
    } catch (error) {
      console.error('[ERROR] getting paginated history:', error);
      return [];
    }
  },

  async getHistoryPage({ search = '', tag = '', correspondent = '', sortColumn = 'created_at', sortDir = 'desc', limit = 10, offset = 0 } = {}) {
    const sortable = new Set(['document_id', 'title', 'correspondent', 'created_at']);
    const column = sortable.has(sortColumn) ? sortColumn : 'created_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const clauses = [];
    const params = [];
    if (search) {
      clauses.push('(title LIKE ? OR correspondent LIKE ? OR tags LIKE ? OR CAST(document_id AS TEXT) LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    if (tag) {
      clauses.push('EXISTS (SELECT 1 FROM json_each(history_documents.tags) WHERE CAST(json_each.value AS TEXT) = ?)');
      params.push(String(tag));
    }
    if (correspondent) {
      clauses.push('correspondent = ?');
      params.push(correspondent);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare('SELECT COUNT(*) AS count FROM history_documents').get().count;
    const filtered = db.prepare(`SELECT COUNT(*) AS count FROM history_documents ${where}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM history_documents ${where} ORDER BY ${column} ${direction} LIMIT ? OFFSET ?`)
      .all(...params, Math.min(Math.max(Number(limit) || 10, 1), 100), Math.max(Number(offset) || 0, 0));
    return { rows, total, filtered };
  },

  async getLatestMetrics(documentId: number) {
    return db.prepare(`
      SELECT promptTokens, completionTokens, totalTokens, created_at
      FROM openai_metrics
      WHERE document_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `).get(documentId) || null;
  },

  async addToOcrQueue(documentId: number, title: string, reason = 'manual') {
    const result = db.prepare(`
      INSERT INTO ocr_queue (document_id, title, reason, status)
      VALUES (?, ?, ?, 'pending')
      ON CONFLICT(document_id) DO UPDATE SET
        title = excluded.title,
        reason = excluded.reason,
        status = CASE WHEN ocr_queue.status = 'processing' THEN ocr_queue.status ELSE 'pending' END,
        updated_at = CURRENT_TIMESTAMP,
        last_error = NULL
    `).run(documentId, title || `Document ${documentId}`, reason);
    return result.changes > 0;
  },

  async getOcrQueueItem(documentId: number) {
    return db.prepare('SELECT * FROM ocr_queue WHERE document_id = ?').get(documentId);
  },

  async getOcrQueuePage({ search = '', status = '', limit = 10, offset = 0 } = {}) {
    const pattern = `%${search}%`;
    const rows = db.prepare(`
      SELECT * FROM ocr_queue
      WHERE (? = '' OR title LIKE ? OR CAST(document_id AS TEXT) LIKE ?)
        AND (? = '' OR status = ?)
      ORDER BY added_at DESC LIMIT ? OFFSET ?
    `).all(search, pattern, pattern, status, status, Math.min(Math.max(Number(limit) || 10, 1), 100), Math.max(Number(offset) || 0, 0));
    const count = db.prepare(`
      SELECT COUNT(*) AS count FROM ocr_queue
      WHERE (? = '' OR title LIKE ? OR CAST(document_id AS TEXT) LIKE ?)
        AND (? = '' OR status = ?)
    `).get(search, pattern, pattern, status, status).count;
    return { rows, total: count };
  },

  async updateOcrQueueStatus(documentId: number, status: string, { text = null, error = null, incrementAttempts = false }: { text?: string | null; error?: string | null; incrementAttempts?: boolean } = {}) {
    const result = db.prepare(`
      UPDATE ocr_queue SET status = ?, ocr_text = COALESCE(?, ocr_text), last_error = ?,
        attempts = attempts + ?, updated_at = CURRENT_TIMESTAMP,
        processed_at = CASE WHEN ? IN ('done', 'failed') THEN CURRENT_TIMESTAMP ELSE processed_at END
      WHERE document_id = ?
    `).run(status, text, error, incrementAttempts ? 1 : 0, status, documentId);
    return result.changes > 0;
  },

  async recoverInterruptedOcrJobs() {
    const result = db.prepare(`
      UPDATE ocr_queue SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('processing', 'analyzing')
    `).run();
    return result.changes;
  },

  async removeFromOcrQueue(documentId: number) {
    return db.prepare('DELETE FROM ocr_queue WHERE document_id = ? AND status != ?').run(documentId, 'processing').changes > 0;
  },

  async addFailedDocument(documentId: number, title: string, reason: string, source = 'ai', lastError: string | null = null) {
    db.prepare(`
      INSERT INTO failed_documents (document_id, title, failed_reason, source, last_error)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        title = excluded.title, failed_reason = excluded.failed_reason, source = excluded.source,
        attempts = failed_documents.attempts + 1, last_error = excluded.last_error,
        updated_at = CURRENT_TIMESTAMP
    `).run(documentId, title || `Document ${documentId}`, reason, source, lastError);
    return true;
  },

  async isDocumentFailed(documentId: number) {
    return Boolean(db.prepare('SELECT 1 FROM failed_documents WHERE document_id = ?').get(documentId));
  },

  async getFailedDocumentsPage({ search = '', limit = 10, offset = 0 } = {}) {
    const pattern = `%${search}%`;
    const rows = db.prepare(`SELECT * FROM failed_documents
      WHERE (? = '' OR title LIKE ? OR failed_reason LIKE ? OR CAST(document_id AS TEXT) LIKE ?)
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(search, pattern, pattern, pattern, Math.min(Math.max(Number(limit) || 10, 1), 100), Math.max(Number(offset) || 0, 0));
    const total = db.prepare(`SELECT COUNT(*) AS count FROM failed_documents
      WHERE (? = '' OR title LIKE ? OR failed_reason LIKE ? OR CAST(document_id AS TEXT) LIKE ?)`)
      .get(search, pattern, pattern, pattern).count;
    return { rows, total };
  },

  async resetFailedDocument(documentId: number) {
    const transaction = db.transaction(() => {
      const removed = db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId).changes;
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      return removed;
    });
    return transaction() > 0;
  },

  async requestRescan(documentId: number, requestedBy = 'history') {
    return db.transaction(() => {
      if (db.prepare('SELECT 1 FROM ignored_documents WHERE document_id = ?').get(documentId)) {
        return false;
      }
      db.prepare('DELETE FROM processed_documents WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId);
      db.prepare(`
        UPDATE review_suggestions
        SET status = 'superseded',
            review_note = COALESCE(review_note, 'Superseded by an explicit rescan'),
            updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND status IN ('staging', 'pending', 'applying')
      `).run(documentId);
      db.prepare(`
        INSERT INTO rescan_requests (document_id, requested_by)
        VALUES (?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          requested_by = excluded.requested_by,
          requested_at = CURRENT_TIMESTAMP
      `).run(documentId, String(requestedBy || 'history').slice(0, 80));
      return true;
    })();
  },

  async getPendingRescanRequests(limit = 100) {
    return db.prepare(`
      SELECT document_id, requested_by, requested_at
      FROM rescan_requests
      ORDER BY requested_at ASC
      LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 100, 1), 500));
  },

  async completeRescanRequest(documentId: number) {
    return db.prepare('DELETE FROM rescan_requests WHERE document_id = ?').run(documentId).changes > 0;
  },

  async resetForRescan(documentId: number) {
    return db.transaction(() => {
      db.prepare('DELETE FROM processed_documents WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId);
      db.prepare(`
        UPDATE review_suggestions
        SET status = 'superseded',
            review_note = COALESCE(review_note, 'Superseded by an explicit rescan'),
            updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND status IN ('staging', 'pending', 'applying')
      `).run(documentId);
      return true;
    })();
  },

  async ignoreDocument(documentId: number, title = '', reason = '') {
    return db.transaction(() => {
      db.prepare(`
        INSERT INTO ignored_documents (document_id, title, reason)
        VALUES (?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          title = excluded.title,
          reason = excluded.reason,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        documentId,
        String(title || `Document ${documentId}`).slice(0, 500),
        String(reason || '').slice(0, 2000)
      );
      db.prepare('DELETE FROM rescan_requests WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM ocr_queue WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId);
      db.prepare(`
        UPDATE review_suggestions
        SET status = 'ignored',
            review_note = COALESCE(review_note, 'Document moved to the permanent ignore list'),
            updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND status IN ('staging', 'pending', 'applying')
      `).run(documentId);
      return true;
    })();
  },

  async unignoreDocument(documentId: number) {
    return db.transaction(() => {
      const removed = db.prepare('DELETE FROM ignored_documents WHERE document_id = ?').run(documentId).changes;
      if (!removed) return false;
      db.prepare('DELETE FROM processed_documents WHERE document_id = ?').run(documentId);
      db.prepare(`
        INSERT INTO rescan_requests (document_id, requested_by)
        VALUES (?, 'unignore')
        ON CONFLICT(document_id) DO UPDATE SET
          requested_by = 'unignore',
          requested_at = CURRENT_TIMESTAMP
      `).run(documentId);
      return true;
    })();
  },

  async isDocumentIgnored(documentId: number) {
    return Boolean(db.prepare('SELECT 1 FROM ignored_documents WHERE document_id = ?').get(documentId));
  },

  async getIgnoredDocumentsPage({ search = '', limit = 10, offset = 0 } = {}) {
    const pattern = `%${search}%`;
    const rows = db.prepare(`
      SELECT * FROM ignored_documents
      WHERE (? = '' OR title LIKE ? OR reason LIKE ? OR CAST(document_id AS TEXT) LIKE ?)
      ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(
      search,
      pattern,
      pattern,
      pattern,
      Math.min(Math.max(Number(limit) || 10, 1), 100),
      Math.max(Number(offset) || 0, 0)
    );
    const total = db.prepare(`
      SELECT COUNT(*) AS count FROM ignored_documents
      WHERE (? = '' OR title LIKE ? OR reason LIKE ? OR CAST(document_id AS TEXT) LIKE ?)
    `).get(search, pattern, pattern, pattern).count;
    return { rows, total };
  },

  async getRecoveryCounts() {
    return {
      failed: Number(db.prepare('SELECT COUNT(*) AS count FROM failed_documents').get().count || 0),
      ignored: Number(db.prepare('SELECT COUNT(*) AS count FROM ignored_documents').get().count || 0),
      ocr: Number(db.prepare("SELECT COUNT(*) AS count FROM ocr_queue WHERE status NOT IN ('done')").get().count || 0)
    };
  },

  async getTrackedDocumentIds() {
    return db.prepare(`
      SELECT DISTINCT document_id FROM (
        SELECT document_id FROM processed_documents UNION ALL
        SELECT document_id FROM history_documents UNION ALL
        SELECT document_id FROM original_documents UNION ALL
        SELECT document_id FROM ocr_queue UNION ALL
        SELECT document_id FROM failed_documents UNION ALL
        SELECT document_id FROM ignored_documents UNION ALL
        SELECT document_id FROM rescan_requests UNION ALL
        SELECT document_id FROM review_suggestions
      )
    `).all().map((row: { document_id: number | string }) => Number(row.document_id));
  },

  async purgeLocalDocument(documentId: number) {
    db.transaction(() => {
      for (const table of ['processed_documents', 'history_documents', 'original_documents', 'processing_status', 'ocr_queue', 'failed_documents', 'ignored_documents', 'rescan_requests', 'review_suggestions', 'openai_metrics']) {
        db.prepare(`DELETE FROM ${table} WHERE document_id = ?`).run(documentId);
      }
    })();
    return true;
  },

  async setUserMfaSettings(username: string, enabled: boolean, secret: string | null = null) {
    return db.prepare('UPDATE users SET mfa_enabled = ?, mfa_secret = ? WHERE username = ?')
      .run(enabled ? 1 : 0, enabled ? secret : null, username).changes > 0;
  },

  async deleteAllDocuments() {
    try {
      db.prepare('DELETE FROM processed_documents').run();
      console.log('[DEBUG] All processed_documents deleted');
      db.prepare('DELETE FROM history_documents').run();
      console.log('[DEBUG] All history_documents deleted');
      db.prepare('DELETE FROM original_documents').run();
      console.log('[DEBUG] All original_documents deleted');
      db.prepare('DELETE FROM review_suggestions').run();
      console.log('[DEBUG] All review_suggestions deleted');
      return true;
    } catch (error) {
      console.error('[ERROR] deleting documents:', error);
      return false;
    }
  },

  async deleteDocumentsIdList(idList: unknown) {
    try {
      console.log('[DEBUG] Received idList:', idList);
  
      const ids = Array.isArray(idList)
        ? idList
        : ((idList as { ids?: unknown[] } | null)?.ids || []);
  
      if (!Array.isArray(ids) || ids.length === 0) {
        console.error('[ERROR] Invalid input: must provide an array of ids');
        return false;
      }
  
      // Convert string IDs to integers
      const numericIds = ids.map(id => parseInt(id, 10));
  
      const placeholders = numericIds.map(() => '?').join(', ');
      const query = `DELETE FROM processed_documents WHERE document_id IN (${placeholders})`;
      const query2 = `DELETE FROM history_documents WHERE document_id IN (${placeholders})`;
      const query3 = `DELETE FROM original_documents WHERE document_id IN (${placeholders})`;
      const query4 = `DELETE FROM review_suggestions WHERE document_id IN (${placeholders})`;
      console.log('[DEBUG] Executing SQL query:', query);
      console.log('[DEBUG] Executing SQL query:', query2);
      console.log('[DEBUG] Executing SQL query:', query3);
      console.log('[DEBUG] Executing SQL query:', query4);
      console.log('[DEBUG] With parameters:', numericIds);
  
      const stmt = db.prepare(query);
      const stmt2 = db.prepare(query2);
      const stmt3 = db.prepare(query3);
      const stmt4 = db.prepare(query4);
      const result = stmt.run(...numericIds);
      const result2 = stmt2.run(...numericIds);
      const result3 = stmt3.run(...numericIds);
      const result4 = stmt4.run(...numericIds);

      console.log('[DEBUG] SQL result:', result);
      console.log('[DEBUG] SQL result:', result2);
      console.log('[DEBUG] SQL result:', result3);
      console.log('[DEBUG] SQL result:', result4);
      console.log(`[DEBUG] Documents with IDs ${numericIds.join(', ')} deleted`);
      return true;
    } catch (error) {
      console.error('[ERROR] deleting documents:', error);
      return false;
    }
  },


  async addUser(username: string, password: string) {
    try {
      // Lösche alle vorhandenen Benutzer
      const deleteResult = db.prepare('DELETE FROM users').run();
      console.log(`[DEBUG] ${deleteResult.changes} existing users deleted`);
  
      // Füge den neuen Benutzer hinzu
      const result = insertUser.run(username, password);
      if (result.changes > 0) {
        console.log(`[DEBUG] User ${username} added`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] adding user:', error);
      return false;
    }
  },

  async getUser(username: string) {
    try {
      return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    } catch (error) {
      console.error('[ERROR] getting user:', error);
      return [];
    }
  },

  async getUsers() {
    try {
      return db.prepare('SELECT * FROM users').all();
    } catch (error) {
      console.error('[ERROR] getting users:', error);
      return [];
    }
  },

  async getProcessingTimeStats() {
    try {
      return db.prepare(`
        SELECT 
          strftime('%H', processed_at) as hour,
          COUNT(*) as count
        FROM processed_documents 
        WHERE date(processed_at) = date('now')
        GROUP BY hour
        ORDER BY hour
      `).all();
    } catch (error) {
      console.error('[ERROR] getting processing time stats:', error);
      return [];
    }
  },
  
  async  getTokenDistribution() {
    try {
      return db.prepare(`
        SELECT 
          CASE 
            WHEN totalTokens < 1000 THEN '0-1k'
            WHEN totalTokens < 2000 THEN '1k-2k'
            WHEN totalTokens < 3000 THEN '2k-3k'
            WHEN totalTokens < 4000 THEN '3k-4k'
            WHEN totalTokens < 5000 THEN '4k-5k'
            ELSE '5k+'
          END as range,
          COUNT(*) as count
        FROM openai_metrics
        GROUP BY range
        ORDER BY range
      `).all();
    } catch (error) {
      console.error('[ERROR] getting token distribution:', error);
      return [];
    }
  },
  
  async getDocumentTypeStats() {
    try {
      return db.prepare(`
        SELECT 
          substr(title, 1, instr(title || ' ', ' ') - 1) as type,
          COUNT(*) as count
        FROM processed_documents
        GROUP BY type
      `).all();
    } catch (error) {
      console.error('[ERROR] getting document type stats:', error);
      return [];
    }
},

async setProcessingStatus(documentId: number, title: string, status: string) {
  try {
      if (status === 'complete') {
          const result = clearProcessingStatus.run(documentId);
          return result.changes > 0;
      } else {
          const result = upsertProcessingStatus.run(documentId, title, status);
          return result.changes > 0;
      }
  } catch (error) {
      console.error('[ERROR] updating processing status:', error);
      return false;
  }
},

async getCurrentProcessingStatus() {
  try {
      const active = getActiveProcessing.get();
      
      // Get last processed document with explicit UTC time
      const lastProcessed = db.prepare(`
          SELECT 
              document_id, 
              title, 
              datetime(processed_at) as processed_at 
          FROM processed_documents 
          ORDER BY processed_at DESC 
          LIMIT 1`
      ).get();

      const processedToday = db.prepare(`
          SELECT COUNT(*) as count 
          FROM processed_documents 
          WHERE date(processed_at) = date('now', 'localtime')`
      ).get();

      return {
          currentlyProcessing: active ? {
              documentId: active.document_id,
              title: active.title,
              startTime: active.start_time,
              status: active.status
          } : null,
          lastProcessed: lastProcessed ? {
              documentId: lastProcessed.document_id,
              title: lastProcessed.title,
              processed_at: lastProcessed.processed_at
          } : null,
          processedToday: processedToday.count,
          isProcessing: !!active
      };
  } catch (error) {
      console.error('[ERROR] getting current processing status:', error);
      return {
          currentlyProcessing: null,
          lastProcessed: null,
          processedToday: 0,
          isProcessing: false
      };
  }
},


  // Utility method to close the database connection
  closeDatabase() {
    return new Promise<void>((resolve, reject) => {
      try {
        db.close();
        console.log('[DEBUG] Database closed successfully');
        resolve();
      } catch (error) {
        console.error('[ERROR] closing database:', error);
        reject(error);
      }
    });
  }
};

export default documentModel;
module.exports = documentModel;
