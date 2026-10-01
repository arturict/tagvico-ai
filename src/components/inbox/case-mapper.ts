import { extractAmount, zurichDateOf } from './dates';
import type { InboxCase, InboxCaseStatus, InboxPriority } from './types';

type Row = Record<string, unknown>;

const STATUSES = new Set<string>(['suggested', 'open', 'waiting', 'done', 'dismissed']);
const PRIORITIES = new Set<string>(['low', 'normal', 'high', 'urgent']);

export function cleanText(value: unknown, max = 240) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

/**
 * Maps a case row to the shape the feed renders. It accepts both the list rows of
 * `actionCenter.listCases` and the single case that `/api/actions/<id>` returns.
 */
export function caseFromRow(row: Row): InboxCase {
  const status = (STATUSES.has(String(row.status)) ? row.status : 'open') as InboxCaseStatus;
  const steps = Array.isArray(row.steps) ? row.steps as Row[] : null;
  const title = cleanText(row.title);
  const summary = cleanText(row.summary, 400);
  return {
    id: String(row.id),
    title,
    summary,
    status,
    priority: (PRIORITIES.has(String(row.priority)) ? row.priority : 'normal') as InboxPriority,
    dueAt: row.dueAt ? String(row.dueAt).slice(0, 10) : null,
    assigneeId: row.assigneeMemberId ? String(row.assigneeMemberId) : null,
    documentId: Number(row.paperlessDocumentId) || null,
    amount: extractAmount(title, summary),
    stepCount: steps ? steps.length : Number(row.step_count) || 0,
    doneStepCount: steps ? steps.filter((step) => step.status === 'done').length : Number(row.completed_step_count) || 0,
    doneAt: status === 'done' ? zurichDateOf(String(row.updatedAt ?? row.updated_at ?? '')) : null
  };
}
