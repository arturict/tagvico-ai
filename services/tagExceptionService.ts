const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const tagGroups = require('./tagGroupService');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'documents.db'));
db.pragma('journal_mode = WAL');

function migrate() {
  db.prepare(`CREATE TABLE IF NOT EXISTS tag_exceptions (
    id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, suggested_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
    resolution_group TEXT
  )`).run();
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_exceptions_pending
    ON tag_exceptions(document_id, normalized_name) WHERE status = 'pending'`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS tag_ai_assignments (
    document_id INTEGER NOT NULL, normalized_name TEXT NOT NULL, tag_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(document_id, normalized_name)
  )`).run();
}

function enqueue(documentId: number, names: unknown) {
  migrate();
  const insert = db.prepare(`INSERT OR IGNORE INTO tag_exceptions
    (document_id, suggested_name, normalized_name) VALUES (?, ?, ?)`);
  const transaction = db.transaction((values: string[]) => values.forEach((name: string) => insert.run(documentId, name, tagGroups.normalizeTag(name))));
  transaction(tagGroups.cleanTags(names));
}

function list(status = 'pending') {
  migrate();
  return db.prepare(`SELECT * FROM tag_exceptions WHERE status = ? ORDER BY datetime(created_at) DESC, id DESC`).all(status);
}

function get(id: number) { migrate(); return db.prepare(`SELECT * FROM tag_exceptions WHERE id = ?`).get(id); }
function resolve(id: number, status: 'approved' | 'rejected', groupId: string | null = null) {
  migrate();
  return db.prepare(`UPDATE tag_exceptions SET status = ?, resolution_group = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`).run(status, groupId, id);
}

function recordAssignments(documentId: number, names: unknown, tagIds: number[] = []) {
  migrate();
  const values = tagGroups.cleanTags(names);
  const insert = db.prepare(`INSERT OR IGNORE INTO tag_ai_assignments (document_id, normalized_name, tag_id) VALUES (?, ?, ?)`);
  db.transaction(() => values.forEach((name: string, index: number) => insert.run(documentId, tagGroups.normalizeTag(name), tagIds[index] || null)))();
}

function assignmentCount(documentId: number) {
  migrate();
  return db.prepare(`SELECT COUNT(*) AS count FROM tag_ai_assignments WHERE document_id = ?`).get(documentId).count;
}

export = { migrate, enqueue, list, get, resolve, recordAssignments, assignmentCount };
