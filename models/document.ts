// @ts-nocheck — legacy module; tracked for strict typing.
// models/document.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { get } = require('http');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database with WAL mode for better performance
const databasePath = path.join(dataDir, 'documents.db');
const db = new Database(databasePath, {
  //verbose: console.log 
});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all()
  .some((entry) => entry.name === column);

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
  }
];

function runMigrations() {
  const current = Number(db.pragma('user_version', { simple: true })) || 0;
  const pending = MIGRATIONS.filter((entry) => entry.version > current);
  if (pending.length > 0 && fs.existsSync(databasePath)) {
    db.pragma('wal_checkpoint(FULL)');
    const backupPath = `${databasePath}.pre-migration-v${current}-${Date.now()}.bak`;
    fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
    console.log(`[DB] Created pre-migration backup at ${backupPath}`);
  }
  for (const migration of pending) {
    db.transaction(() => {
      migration.up();
      db.pragma(`user_version = ${migration.version}`);
    })();
    console.log(`[DB] Applied migration ${migration.version}`);
  }
}

// Create tables
const createTableMain = db.prepare(`
  CREATE TABLE IF NOT EXISTS processed_documents (
    id INTEGER PRIMARY KEY,
    document_id INTEGER UNIQUE,
    title TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
createTableMain.run();

const createTableMetrics = db.prepare(`
  CREATE TABLE IF NOT EXISTS openai_metrics (
    id INTEGER PRIMARY KEY,
    document_id INTEGER,
    promptTokens INTEGER,
    completionTokens INTEGER,
    totalTokens INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
createTableMetrics.run();

const createTableHistory = db.prepare(`
  CREATE TABLE IF NOT EXISTS history_documents (
    id INTEGER PRIMARY KEY,
    document_id INTEGER,
    tags TEXT,
    title TEXT,
    correspondent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
createTableHistory.run();

const createOriginalDocuments = db.prepare(`
  CREATE TABLE IF NOT EXISTS original_documents (
    id INTEGER PRIMARY KEY,
    document_id INTEGER,
    title TEXT,
    tags TEXT,
    correspondent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
createOriginalDocuments.run();

const userTable = db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
userTable.run();


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

const insertOriginal = db.prepare(`
  INSERT INTO original_documents (document_id, title, tags, correspondent)
  VALUES (?, ?, ?, ?)
`);

const insertHistory = db.prepare(`
  INSERT INTO history_documents (document_id, tags, title, correspondent)
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

const createProcessingStatus = db.prepare(`
  CREATE TABLE IF NOT EXISTS processing_status (
    id INTEGER PRIMARY KEY,
    document_id INTEGER UNIQUE,
    title TEXT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT
  );
`);
createProcessingStatus.run();
runMigrations();

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


module.exports = {
  getDatabase() {
    return db;
  },

  getSchemaVersion() {
    return Number(db.pragma('user_version', { simple: true })) || 0;
  },

  async backupDatabase(targetPath) {
    await db.backup(targetPath);
    return targetPath;
  },

  async addProcessedDocument(documentId, title) {
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

  async addOpenAIMetrics(documentId, promptTokens, completionTokens, totalTokens) {
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

  async isDocumentProcessed(documentId) {
    try {
      const row = findDocument.get(documentId);
      return !!row;
    } catch (error) {
      console.error('[ERROR] checking document:', error);
      // Im Zweifelsfall true zurückgeben, um doppelte Verarbeitung zu vermeiden
      return true;
    }
  },

  async saveOriginalData(documentId, tags, correspondent, title) {
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

  async saveOriginalSnapshot(documentId, snapshot = {}) {
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

  async addToHistory(documentId, tagIds, title, correspondent) {
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

  async getHistory(id) {
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

  async getOriginalData(id) {
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
  
  async getPaginatedHistory(limit, offset) {
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

  async addToOcrQueue(documentId, title, reason = 'manual') {
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

  async getOcrQueueItem(documentId) {
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

  async updateOcrQueueStatus(documentId, status, { text = null, error = null, incrementAttempts = false } = {}) {
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

  async removeFromOcrQueue(documentId) {
    return db.prepare('DELETE FROM ocr_queue WHERE document_id = ? AND status != ?').run(documentId, 'processing').changes > 0;
  },

  async addFailedDocument(documentId, title, reason, source = 'ai', lastError = null) {
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

  async isDocumentFailed(documentId) {
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

  async resetFailedDocument(documentId) {
    const transaction = db.transaction(() => {
      const removed = db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId).changes;
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      return removed;
    });
    return transaction() > 0;
  },

  async resetForRescan(documentId) {
    return db.transaction(() => {
      db.prepare('DELETE FROM processed_documents WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM processing_status WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM failed_documents WHERE document_id = ?').run(documentId);
      return true;
    })();
  },

  async getTrackedDocumentIds() {
    return db.prepare(`
      SELECT DISTINCT document_id FROM (
        SELECT document_id FROM processed_documents UNION ALL
        SELECT document_id FROM history_documents UNION ALL
        SELECT document_id FROM original_documents UNION ALL
        SELECT document_id FROM ocr_queue UNION ALL
        SELECT document_id FROM failed_documents
      )
    `).all().map((row) => Number(row.document_id));
  },

  async purgeLocalDocument(documentId) {
    db.transaction(() => {
      for (const table of ['processed_documents', 'history_documents', 'original_documents', 'processing_status', 'ocr_queue', 'failed_documents', 'openai_metrics']) {
        db.prepare(`DELETE FROM ${table} WHERE document_id = ?`).run(documentId);
      }
    })();
    return true;
  },

  async setUserMfaSettings(username, enabled, secret = null) {
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
      return true;
    } catch (error) {
      console.error('[ERROR] deleting documents:', error);
      return false;
    }
  },

  async deleteDocumentsIdList(idList) {
    try {
      console.log('[DEBUG] Received idList:', idList);
  
      const ids = Array.isArray(idList) ? idList : (idList?.ids || []);
  
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
      console.log('[DEBUG] Executing SQL query:', query);
      console.log('[DEBUG] Executing SQL query:', query2);
      console.log('[DEBUG] Executing SQL query:', query3);
      console.log('[DEBUG] With parameters:', numericIds);
  
      const stmt = db.prepare(query);
      const stmt2 = db.prepare(query2);
      const stmt3 = db.prepare(query3);
      const result = stmt.run(...numericIds);
      const result2 = stmt2.run(...numericIds);
      const result3 = stmt3.run(...numericIds);

      console.log('[DEBUG] SQL result:', result);
      console.log('[DEBUG] SQL result:', result2);
      console.log('[DEBUG] SQL result:', result3);
      console.log(`[DEBUG] Documents with IDs ${numericIds.join(', ')} deleted`);
      return true;
    } catch (error) {
      console.error('[ERROR] deleting documents:', error);
      return false;
    }
  },


  async addUser(username, password) {
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

  async getUser(username) {
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

async setProcessingStatus(documentId, title, status) {
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
    return new Promise((resolve, reject) => {
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
