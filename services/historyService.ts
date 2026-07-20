// services/historyService.js
//
// Thin wrapper around the history_documents SQLite table that knows about
// the new "diff" JSON column. The model layer (models/document.js) is
// intentionally left alone; historyService provides the diff-aware reads
// and writes and is also responsible for running the small migration that
// adds the column on startup.

import path from 'path';
import fs from 'fs';
import { resolveDataDirectory } from './dataDirectory';
// better-sqlite3 11 does not bundle TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');

const dataDir = resolveDataDirectory();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'documents.db'));
db.pragma('journal_mode = WAL');

// Statements are created lazily inside the functions below so the migrate()
// call on first use is what actually creates the table. We keep the
// prepared statement cache on the module so subsequent calls are still
// fast.
type Statement = ReturnType<typeof db.prepare>;
interface Statements { insert: Statement; byId: Statement; byDocument: Statement; latestByDocument: Statement }
interface HistoryRow {
  id: number; document_id: number; tags: string | null; title: string | null;
  correspondent: string | null; diff: string | null; created_at: string;
}
let _stmts: Statements | null = null;

function getStmts(): Statements {
  if (_stmts) return _stmts;
  _stmts = {
    insert: db.prepare(`
      INSERT INTO history_documents (document_id, tags, title, correspondent, diff)
      VALUES (?, ?, ?, ?, ?)
    `),
    byId: db.prepare(`SELECT * FROM history_documents WHERE id = ?`),
    byDocument: db.prepare(`
      SELECT * FROM history_documents
      WHERE document_id = ?
      ORDER BY created_at DESC
    `),
    latestByDocument: db.prepare(`
      SELECT * FROM history_documents
      WHERE document_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `)
  };
  return _stmts;
}

/**
 * Idempotent migration: ensure the history_documents table exists, then
 * add a `diff` column if it isn't there yet. Safe to call on every
 * startup.
 */
function migrate() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS history_documents (
      id INTEGER PRIMARY KEY,
      document_id INTEGER,
      tags TEXT,
      title TEXT,
      correspondent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  // ALTER TABLE ... ADD COLUMN is not natively idempotent in SQLite, so
  // we probe the table info first. Doing it this way keeps the migration
  // a single round-trip when the column already exists.
  const columns = db.prepare(`PRAGMA table_info(history_documents)`).all();
  const hasDiff = columns.some((col: unknown) =>
    typeof col === 'object' && col !== null && 'name' in col && col.name === 'diff');
  if (!hasDiff) {
    db.prepare(`ALTER TABLE history_documents ADD COLUMN diff TEXT`).run();
  }

  // Drop the cached prepared statements so the new column is reflected.
  _stmts = null;
}

/**
 * Add a history row with a structured diff payload attached.
 *
 * @param {number} documentId
 * @param {Array<number>} tagIds
 * @param {string} title
 * @param {string} correspondent
 * @param {Array<object>} [diff] - Output of metadataDiff.compareMetadata
 * @returns {boolean}
 */
function addToHistory(documentId: number | string, tagIds: number[], title: string | null, correspondent: string | null, diff?: object[]) {
  try {
    // Make sure the table exists with the diff column. Cheap on subsequent
    // calls — the PRAGMA + ALTER TABLE both no-op.
    migrate();
    const stmts = getStmts();
    const tagIdsString = JSON.stringify(tagIds || []);
    const diffString = diff === undefined || diff === null ? null : JSON.stringify(diff);
    const result = stmts.insert.run(documentId, tagIdsString, title, correspondent, diffString);
    if (result.changes > 0) {
      console.log(`[DEBUG] Document ${title} added to history with diff (${Array.isArray(diff) ? diff.length : 0} entries)`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[ERROR] adding to history:', error);
    return false;
  }
}

/**
 * Get the most recent history row for a document, parsed.
 *
 * @param {number|string} documentId
 * @returns {object|null}
 */
function getLatestByDocumentId(documentId: number | string) {
  try {
    migrate();
    const stmts = getStmts();
    const row = stmts.latestByDocument.get(documentId);
    if (!row) return null;
    return parseRow(row as HistoryRow);
  } catch (error) {
    console.error('[ERROR] loading history for document:', documentId, error);
    return null;
  }
}

/**
 * Get all history rows for a document, newest first.
 *
 * @param {number|string} documentId
 * @returns {Array<object>}
 */
function getAllByDocumentId(documentId: number | string) {
  try {
    migrate();
    const stmts = getStmts();
    const rows = stmts.byDocument.all(documentId);
    return rows.map((row: unknown) => parseRow(row as HistoryRow));
  } catch (error) {
    console.error('[ERROR] loading history for document:', documentId, error);
    return [];
  }
}

/**
 * Look up a specific history row by its primary key.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
function getById(id: number | string) {
  try {
    migrate();
    const stmts = getStmts();
    const row = stmts.byId.get(id);
    if (!row) return null;
    return parseRow(row as HistoryRow);
  } catch (error) {
    console.error('[ERROR] loading history row:', id, error);
    return null;
  }
}

function parseRow(row: HistoryRow) {
  let parsedTags: unknown[] = [];
  try {
    parsedTags = row.tags ? JSON.parse(row.tags) : [];
  } catch {
    parsedTags = [];
  }

  let parsedDiff: unknown = null;
  if (row.diff) {
    try {
      parsedDiff = JSON.parse(row.diff);
    } catch {
      parsedDiff = null;
    }
  }

  return {
    id: row.id,
    document_id: row.document_id,
    title: row.title,
    correspondent: row.correspondent,
    tags: parsedTags,
    diff: parsedDiff,
    created_at: row.created_at
  };
}

module.exports = {
  migrate,
  addToHistory,
  getLatestByDocumentId,
  getAllByDocumentId,
  getById
};
