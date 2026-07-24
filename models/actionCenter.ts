import crypto from 'node:crypto';

import documentModel from './document';
const db = documentModel.getDatabase();

export type CaseStatus = 'suggested' | 'open' | 'waiting' | 'done' | 'dismissed';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';
export type CaseSource = 'manual' | 'ai' | 'paperless' | 'telegram';

export interface ActionCaseInput {
  paperlessDocumentId: number;
  title: string;
  summary?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  dueAt?: string | null;
  assigneeMemberId?: string | null;
  source?: CaseSource;
  confidence?: number | null;
  steps?: Array<{ title: string; dueAt?: string | null }>;
}

const CASE_STATUSES = new Set<CaseStatus>(['suggested', 'open', 'waiting', 'done', 'dismissed']);
const PRIORITIES = new Set<CasePriority>(['low', 'normal', 'high', 'urgent']);
const SOURCES = new Set<CaseSource>(['manual', 'ai', 'paperless', 'telegram']);
const APPROVAL_ACTIONS = new Set(['action.create', 'action.update', 'paperless.patch']);
const id = () => crypto.randomUUID();
const json = (value: unknown) => JSON.stringify(value ?? {});

function assertText(value: unknown, label: string, max = 240): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > max) throw new Error(`${label} must be at most ${max} characters`);
  return normalized;
}

function assertDocumentId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('A valid Paperless document ID is required');
  return parsed;
}

function optionalText(value: unknown, label: string, max: number): string {
  const normalized = String(value ?? '').trim();
  if (normalized.length > max) throw new Error(label + ' must be at most ' + max + ' characters');
  return normalized;
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('Due date must use YYYY-MM-DD');
  const parsed = new Date(normalized + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error('Due date is invalid');
  return normalized;
}

function memberInHousehold(householdId: string, memberId: string | null | undefined) {
  if (!memberId) return null;
  return db.prepare('SELECT * FROM household_members WHERE id=? AND household_id=? AND active=1').get(memberId, householdId) as Record<string, unknown> | undefined;
}

function assertAssignee(householdId: string, memberId: string | null | undefined): string | null {
  if (!memberId) return null;
  if (!memberInHousehold(householdId, memberId)) throw new Error('Assignee is not an active member of this household');
  return memberId;
}

function parseRow(row: Record<string, unknown>): Record<string, any> {
  return {
    ...row,
    paperlessDocumentId: row.paperless_document_id,
    householdId: row.household_id,
    assigneeMemberId: row.assignee_member_id,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error
  };
}

export function ensureWorkspaceForUser(userId: number, username: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Authenticated user ID is required');
  const existing = db.prepare(`
    SELECT h.*, hm.id AS member_id, hm.role AS member_role
    FROM household_members hm JOIN households h ON h.id = hm.household_id
    WHERE hm.user_id = ? AND hm.active = 1 ORDER BY h.created_at LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;
  if (existing) return existing;

  return db.transaction(() => {
    const householdId = id();
    const memberId = id();
    db.prepare('INSERT INTO households (id, name, kind, created_by) VALUES (?, ?, ?, ?)')
      .run(householdId, `${assertText(username, 'Username', 80)}'s household`, 'solo', userId);
    db.prepare(`INSERT INTO household_members (id, household_id, user_id, display_name, role) VALUES (?, ?, ?, ?, 'owner')`)
      .run(memberId, householdId, userId, username);
    return { id: householdId, name: `${username}'s household`, kind: 'solo', created_by: userId, member_id: memberId, member_role: 'owner' };
  })();
}

export function getWorkspaceForUser(userId: number) {
  return db.prepare(`
    SELECT h.*, hm.id AS member_id, hm.display_name, hm.role AS member_role
    FROM household_members hm JOIN households h ON h.id = hm.household_id
    WHERE hm.user_id = ? AND hm.active = 1 ORDER BY h.created_at LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;
}

export function listCases(householdId: string, filters: { status?: string; assignee?: string } = {}) {
  const clauses = ['ac.household_id = ?'];
  const values: unknown[] = [householdId];
  if (filters.status && CASE_STATUSES.has(filters.status as CaseStatus)) {
    clauses.push('ac.status = ?'); values.push(filters.status);
  }
  if (filters.assignee) { clauses.push('ac.assignee_member_id = ?'); values.push(filters.assignee); }
  const rows = db.prepare(`
    SELECT ac.*, hm.display_name AS assignee_name,
      (SELECT COUNT(*) FROM action_steps s WHERE s.case_id = ac.id) AS step_count,
      (SELECT COUNT(*) FROM action_steps s WHERE s.case_id = ac.id AND s.status = 'done') AS completed_step_count
    FROM action_cases ac LEFT JOIN household_members hm ON hm.id = ac.assignee_member_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY CASE ac.status WHEN 'suggested' THEN 0 WHEN 'open' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
      CASE ac.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      COALESCE(ac.due_at, '9999-12-31'), ac.updated_at DESC
  `).all(...values) as Array<Record<string, unknown>>;
  return rows.map(parseRow);
}

export function getCase(householdId: string, caseId: string): Record<string, any> | null {
  const row = db.prepare(`SELECT ac.*, hm.display_name AS assignee_name FROM action_cases ac LEFT JOIN household_members hm ON hm.id = ac.assignee_member_id WHERE ac.id = ? AND ac.household_id = ?`).get(caseId, householdId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const steps = db.prepare('SELECT * FROM action_steps WHERE case_id = ? ORDER BY position, created_at').all(caseId);
  const events = db.prepare('SELECT * FROM action_events WHERE case_id = ? ORDER BY created_at DESC LIMIT 100').all(caseId) as Array<Record<string, unknown>>;
  return { ...parseRow(row), steps, events: events.map((entry) => ({ ...entry, payload: JSON.parse(String(entry.payload_json || '{}')) })) } as Record<string, any>;
}

export function createCase(householdId: string, actorMemberId: string | null, input: ActionCaseInput) {
  const title = assertText(input.title, 'Title');
  const documentId = assertDocumentId(input.paperlessDocumentId);
  if (input.status && !CASE_STATUSES.has(input.status)) throw new Error('Invalid action status');
  if (input.priority && !PRIORITIES.has(input.priority)) throw new Error('Invalid action priority');
  if (input.source && !SOURCES.has(input.source)) throw new Error('Invalid action source');
  if (input.steps && input.steps.length > 20) throw new Error('An action may contain at most 20 initial steps');
  const status = input.status || 'open';
  const priority = input.priority || 'normal';
  const source = input.source || 'manual';
  const summary = optionalText(input.summary, 'Summary', 2000);
  const dueAt = optionalDate(input.dueAt);
  const assignee = assertAssignee(householdId, input.assigneeMemberId);
  const confidence = input.confidence ?? null;
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('Confidence must be between 0 and 1');
  const caseId = id();
  return db.transaction(() => {
    db.prepare(`INSERT INTO action_cases
      (id, household_id, paperless_document_id, title, summary, status, priority, due_at, assignee_member_id, source, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(caseId, householdId, documentId, title, summary, status, priority, dueAt, assignee, source, confidence);
    for (const [position, step] of (input.steps || []).entries()) {
      db.prepare('INSERT INTO action_steps (id, case_id, title, due_at, position) VALUES (?, ?, ?, ?, ?)')
        .run(id(), caseId, assertText(step.title, 'Step title'), optionalDate(step.dueAt), position);
    }
    addEvent(caseId, actorMemberId, 'case.created', { source, documentId });
    return getCase(householdId, caseId);
  })();
}

export function updateCase(householdId: string, caseId: string, actorMemberId: string | null, patch: Partial<ActionCaseInput>) {
  const current = getCase(householdId, caseId);
  if (!current) throw new Error('Action case not found');
  const values = {
    title: patch.title === undefined ? current.title : assertText(patch.title, 'Title'),
    summary: patch.summary === undefined ? current.summary : optionalText(patch.summary, 'Summary', 2000),
    status: patch.status === undefined ? current.status : patch.status,
    priority: patch.priority === undefined ? current.priority : patch.priority,
    dueAt: patch.dueAt === undefined ? current.dueAt : optionalDate(patch.dueAt),
    assignee: patch.assigneeMemberId === undefined ? current.assigneeMemberId : assertAssignee(householdId, patch.assigneeMemberId)
  };
  if (!CASE_STATUSES.has(values.status)) throw new Error('Invalid action status');
  if (!PRIORITIES.has(values.priority)) throw new Error('Invalid action priority');
  db.prepare(`UPDATE action_cases SET title=?, summary=?, status=?, priority=?, due_at=?, assignee_member_id=?, sync_status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=?`)
    .run(values.title, values.summary, values.status, values.priority, values.dueAt || null, values.assignee || null, caseId, householdId);
  addEvent(caseId, actorMemberId, 'case.updated', patch);
  return getCase(householdId, caseId);
}

export function addStep(householdId: string, caseId: string, actorMemberId: string | null, input: { title: string; dueAt?: string | null }) {
  if (!getCase(householdId, caseId)) throw new Error('Action case not found');
  const stepCount = Number((db.prepare('SELECT COUNT(*) AS value FROM action_steps WHERE case_id=?').get(caseId) as { value: number }).value);
  if (stepCount >= 100) throw new Error('An action may contain at most 100 steps');
  const position = Number((db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM action_steps WHERE case_id=?').get(caseId) as { value: number }).value);
  const stepId = id();
  db.prepare('INSERT INTO action_steps (id, case_id, title, due_at, position) VALUES (?, ?, ?, ?, ?)').run(stepId, caseId, assertText(input.title, 'Step title'), optionalDate(input.dueAt), position);
  addEvent(caseId, actorMemberId, 'step.created', { stepId, title: input.title });
  return getCase(householdId, caseId);
}

export function updateStep(householdId: string, caseId: string, stepId: string, actorMemberId: string | null, patch: { title?: string; status?: string; dueAt?: string | null }) {
  if (!getCase(householdId, caseId)) throw new Error('Action case not found');
  const step = db.prepare('SELECT * FROM action_steps WHERE id=? AND case_id=?').get(stepId, caseId) as Record<string, unknown> | undefined;
  if (!step) throw new Error('Step not found');
  if (patch.status !== undefined && !['open', 'done', 'dismissed'].includes(patch.status)) throw new Error('Invalid step status');
  const status = patch.status ?? step.status;
  db.prepare('UPDATE action_steps SET title=?, status=?, due_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?')
    .run(patch.title === undefined ? step.title : assertText(patch.title, 'Step title'), status, patch.dueAt === undefined ? step.due_at : optionalDate(patch.dueAt), stepId, caseId);
  addEvent(caseId, actorMemberId, 'step.updated', { stepId, ...patch });
  return getCase(householdId, caseId);
}

export function dashboard(householdId: string) {
  return db.prepare(`SELECT
    SUM(CASE WHEN status IN ('suggested','open','waiting') THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) AS suggestions,
    SUM(CASE WHEN status IN ('suggested','open','waiting') AND date(due_at) < date('now') THEN 1 ELSE 0 END) AS overdue,
    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done
    FROM action_cases WHERE household_id=?`).get(householdId);
}

export function addEvent(caseId: string, actorMemberId: string | null, eventType: string, payload: unknown) {
  db.prepare('INSERT INTO action_events (id, case_id, actor_member_id, event_type, payload_json) VALUES (?, ?, ?, ?, ?)')
    .run(id(), caseId, actorMemberId, assertText(eventType, 'Event type', 80), json(payload));
}

export function createSession(householdId: string, memberId: string | null, channel: 'web' | 'telegram' = 'web') {
  if (memberId && !memberInHousehold(householdId, memberId)) throw new Error('Session member is not part of this household');
  const sessionId = id();
  db.prepare('INSERT INTO companion_sessions (id, household_id, member_id, channel) VALUES (?, ?, ?, ?)').run(sessionId, householdId, memberId, channel);
  return sessionId;
}

export function getOrCreateSession(householdId: string, memberId: string | null, channel: 'web' | 'telegram' = 'web') {
  const existing = db.prepare('SELECT id FROM companion_sessions WHERE household_id=? AND member_id IS ? AND channel=? ORDER BY updated_at DESC, created_at DESC LIMIT 1')
    .get(householdId, memberId, channel) as { id: string } | undefined;
  return existing?.id || createSession(householdId, memberId, channel);
}

export function addMessage(sessionId: string, role: 'user' | 'assistant' | 'system' | 'tool', content: unknown) {
  const encoded = json(content);
  if (Buffer.byteLength(encoded, 'utf8') > 128 * 1024) throw new Error('Companion message is too large');
  const messageId = id();
  db.transaction(() => {
    db.prepare('INSERT INTO companion_messages (id, session_id, role, content_json) VALUES (?, ?, ?, ?)').run(messageId, sessionId, role, encoded);
    if (role === 'user' && content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
      const title = String((content as { text: string }).text).replace(/\s+/g, ' ').trim().slice(0, 72);
      if (title) {
        db.prepare("UPDATE companion_sessions SET title=? WHERE id=? AND title='New conversation'").run(title, sessionId);
      }
    }
    db.prepare('UPDATE companion_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sessionId);
  })();
  return messageId;
}

export function listSessions(
  householdId: string,
  memberId: string | null,
  channel: 'web' | 'telegram' = 'web'
) {
  return db.prepare(`
    SELECT cs.id, cs.title, cs.channel, cs.created_at, cs.updated_at,
      COUNT(cm.id) AS message_count,
      COALESCE((
        SELECT json_extract(content_json, '$.text')
        FROM companion_messages preview
        WHERE preview.session_id=cs.id AND preview.role IN ('user','assistant')
        ORDER BY preview.created_at DESC, preview.rowid DESC LIMIT 1
      ), '') AS preview
    FROM companion_sessions cs
    LEFT JOIN companion_messages cm ON cm.session_id=cs.id AND cm.role IN ('user','assistant')
    WHERE cs.household_id=? AND cs.member_id IS ? AND cs.channel=?
    GROUP BY cs.id
    ORDER BY cs.updated_at DESC, cs.created_at DESC, cs.rowid DESC
    LIMIT 100
  `).all(householdId, memberId, channel);
}

export function renameSession(householdId: string, memberId: string | null, sessionId: string, title: string) {
  const normalized = assertText(title.replace(/\s+/g, ' ').trim(), 'Conversation title', 72);
  const result = db.prepare(
    'UPDATE companion_sessions SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=? AND member_id IS ?'
  ).run(normalized, sessionId, householdId, memberId);
  if (!result.changes) throw new Error('Companion session not found');
  return getSession(householdId, sessionId);
}

export function deleteSession(householdId: string, memberId: string | null, sessionId: string) {
  const result = db.prepare(
    'DELETE FROM companion_sessions WHERE id=? AND household_id=? AND member_id IS ?'
  ).run(sessionId, householdId, memberId);
  if (!result.changes) throw new Error('Companion session not found');
  return true;
}

export function getCompanionModelSelection(householdId: string, sessionId: string) {
  const session = db.prepare('SELECT id FROM companion_sessions WHERE id=? AND household_id=?').get(sessionId, householdId);
  if (!session) return null;
  const rows = db.prepare(`
    SELECT content_json FROM companion_messages
    WHERE session_id=? AND role='system'
    ORDER BY created_at DESC, rowid DESC LIMIT 50
  `).all(sessionId) as Array<{ content_json: string }>;
  for (const row of rows) {
    try {
      const content = JSON.parse(String(row.content_json || '{}')) as Record<string, unknown>;
      if (content.type !== 'companion.model-selection') continue;
      const providerInstanceId = String(content.providerInstanceId || '').trim();
      const modelId = String(content.modelId || '').trim();
      if (providerInstanceId && modelId) return { providerInstanceId, modelId };
    } catch {
      // Ignore malformed historical metadata and continue to an older choice.
    }
  }
  return null;
}

export function setCompanionModelSelection(
  householdId: string,
  sessionId: string,
  memberId: string | null,
  selection: { providerInstanceId: string; modelId: string }
) {
  const session = db.prepare('SELECT member_id FROM companion_sessions WHERE id=? AND household_id=?')
    .get(sessionId, householdId) as { member_id?: string | null } | undefined;
  if (!session || session.member_id !== memberId) {
    throw new Error('Companion session not found');
  }
  const content = {
    type: 'companion.model-selection',
    providerInstanceId: assertText(selection.providerInstanceId, 'Provider instance', 80),
    modelId: assertText(selection.modelId, 'Model', 200)
  };
  addMessage(sessionId, 'system', content);
  return content;
}

export function getSession(householdId: string, sessionId: string) {
  const session = db.prepare('SELECT * FROM companion_sessions WHERE id=? AND household_id=?').get(sessionId, householdId);
  if (!session) return null;
  const messages = db.prepare('SELECT * FROM companion_messages WHERE session_id=? ORDER BY created_at LIMIT 200').all(sessionId) as Array<Record<string, unknown>>;
  return { ...session, messages: messages.map((message) => ({ ...message, content: JSON.parse(String(message.content_json)) })) };
}

export function createApproval(householdId: string, sessionId: string | null, memberId: string | null, actionType: string, payload: unknown) {
  if (!APPROVAL_ACTIONS.has(actionType)) throw new Error('Unsupported approval action');
  if (memberId && !memberInHousehold(householdId, memberId)) throw new Error('Approval requester is not part of this household');
  if (sessionId && !db.prepare('SELECT 1 FROM companion_sessions WHERE id=? AND household_id=?').get(sessionId, householdId)) throw new Error('Approval session is not part of this household');
  const encodedPayload = json(payload);
  if (Buffer.byteLength(encodedPayload, 'utf8') > 128 * 1024) throw new Error('Approval payload is too large');
  const approvalId = id();
  db.prepare(`INSERT INTO agent_approvals (id, household_id, session_id, requested_by_member_id, action_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(approvalId, householdId, sessionId, memberId, assertText(actionType, 'Action type', 80), encodedPayload);
  return getApproval(householdId, approvalId);
}

export function getApproval(householdId: string, approvalId: string) {
  const row = db.prepare('SELECT * FROM agent_approvals WHERE id=? AND household_id=?').get(approvalId, householdId) as Record<string, unknown> | undefined;
  return row ? ({ ...row, payload: JSON.parse(String(row.payload_json)), result: row.result_json ? JSON.parse(String(row.result_json)) : null } as Record<string, any>) : null;
}

export function decideApproval(householdId: string, approvalId: string, memberId: string, decision: 'approved' | 'rejected') {
  const member = memberInHousehold(householdId, memberId);
  if (!member || !['owner', 'adult'].includes(String(member.role))) throw new Error('This household role cannot approve changes');
  const result = db.prepare(`UPDATE agent_approvals SET status=?, decided_by_member_id=?, decided_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=? AND status='pending'`)
    .run(decision, memberId, approvalId, householdId);
  if (!result.changes) throw new Error('Approval is no longer pending');
  return getApproval(householdId, approvalId);
}

export function completeApproval(householdId: string, approvalId: string, status: 'executed' | 'failed', result: unknown) {
  db.prepare(`UPDATE agent_approvals SET status=?, result_json=?, executed_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=? AND status='approved'`)
    .run(status, json(result), approvalId, householdId);
  return getApproval(householdId, approvalId);
}

export function listApprovals(householdId: string, status = 'pending') {
  return (db.prepare('SELECT * FROM agent_approvals WHERE household_id=? AND status=? ORDER BY created_at DESC').all(householdId, status) as Array<Record<string, unknown>>)
    .map((row) => ({ ...row, payload: JSON.parse(String(row.payload_json)) }));
}

export function listMembers(householdId: string) {
  return db.prepare(`SELECT id, display_name, role, paperless_user_id,
    paperless_token_encrypted IS NOT NULL AS paperless_configured, active, created_at
    FROM household_members WHERE household_id=? AND active=1
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'adult' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, display_name`).all(householdId);
}

export function addHouseholdMember(householdId: string, displayName: string, role: 'adult' | 'member' | 'viewer' = 'member') {
  if (!['adult', 'member', 'viewer'].includes(role)) throw new Error('Invalid household role');
  const memberId = id();
  db.transaction(() => {
    db.prepare('INSERT INTO household_members (id, household_id, display_name, role) VALUES (?, ?, ?, ?)').run(memberId, householdId, assertText(displayName, 'Display name', 100), role);
    db.prepare("UPDATE households SET kind='family', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(householdId);
  })();
  return db.prepare('SELECT id, display_name, role, active, created_at FROM household_members WHERE id=? AND household_id=?').get(memberId, householdId);
}

export function setPaperlessToken(householdId: string, memberId: string, encryptedToken?: string | null, paperlessUserId?: number | null) {
  const current = getMemberSecretRecord(householdId, memberId);
  if (!current) throw new Error('Household member not found');
  const nextToken = encryptedToken === undefined ? current.paperless_token_encrypted : encryptedToken;
  const nextPaperlessUserId = paperlessUserId === undefined ? current.paperless_user_id : paperlessUserId;
  const result = db.prepare('UPDATE household_members SET paperless_token_encrypted=?, paperless_user_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=?')
    .run(nextToken ?? null, nextPaperlessUserId ?? null, memberId, householdId);
  if (!result.changes) throw new Error('Household member not found');
}

export function getMemberSecretRecord(householdId: string, memberId: string) {
  return db.prepare('SELECT * FROM household_members WHERE id=? AND household_id=? AND active=1').get(memberId, householdId) as Record<string, unknown> | undefined;
}

export function markSynced(householdId: string, caseId: string, fingerprint: string | null, error?: string) {
  db.prepare(`UPDATE action_cases SET paperless_fingerprint=?, sync_status=?, sync_error=?, last_synced_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=?`)
    .run(fingerprint, error ? 'error' : 'synced', error || null, caseId, householdId);
}

export function listSyncTargets(limit = 250) {
  return db.prepare(`
    SELECT ac.id AS case_id, ac.household_id, ac.sync_status,
      COALESCE(ac.assignee_member_id, (
        SELECT hm.id FROM household_members hm WHERE hm.household_id=ac.household_id AND hm.active=1
        ORDER BY CASE WHEN hm.paperless_token_encrypted IS NOT NULL THEN 0 ELSE 1 END,
          CASE hm.role WHEN 'owner' THEN 0 WHEN 'adult' THEN 1 ELSE 2 END LIMIT 1
      )) AS member_id
    FROM action_cases ac
    WHERE ac.status NOT IN ('dismissed')
    ORDER BY COALESCE(ac.last_synced_at, '1970-01-01') ASC LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit) || 250, 1000))) as Array<{ case_id: string; household_id: string; member_id: string | null; sync_status: string }>;
}
