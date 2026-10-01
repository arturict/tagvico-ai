import 'server-only';
import documentModel from '../../../models/document';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { caseFromRow, cleanText } from './case-mapper';
import { addDays, extractAmount, shortDate, zurichDateOf } from './dates';
import type { InboxApproval, InboxCase, InboxData, InboxMember, InboxPriority, InboxReview } from './types';

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {});
export type Workspace = ReturnType<typeof workspaceFor>;

const ACTIVE = new Set<string>(['suggested', 'open', 'waiting']);
const PRIORITIES = new Set<string>(['low', 'normal', 'high', 'urgent']);
const REVIEW_LIMIT = 5;
const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  tags: 'tags',
  correspondent: 'correspondent',
  document_type: 'document type',
  created: 'date',
  language: 'language',
  custom_fields: 'custom fields'
};

/** Resolves the people and the viewer's own role once so the feed and the person page agree. */
export function loadMembers(workspace: Workspace) {
  const members = (actionCenter.listMembers(workspace.householdId) as Row[]).map((member): InboxMember => ({
    id: String(member.id),
    name: String(member.display_name),
    role: String(member.role)
  }));
  const me = members.find((member) => member.id === workspace.memberId) || { id: workspace.memberId, name: 'You', role: workspace.role };
  return { members, me, names: new Map(members.map((member) => [member.id, member.name])) };
}

function describePatch(patch: Row, names: Map<string, string>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'status') parts.push(`status to ${cleanText(value, 40)}`);
    else if (key === 'priority') parts.push(`priority to ${cleanText(value, 40)}`);
    else if (key === 'dueAt') parts.push(value ? `due date to ${shortDate(String(value))}` : 'no due date');
    else if (key === 'assigneeMemberId') parts.push(value ? `assignee to ${names.get(String(value)) || 'a member'}` : 'no assignee');
    else if (key === 'title') parts.push('title');
    else if (key === 'summary') parts.push('summary');
    else parts.push(FIELD_LABELS[key] || key.replaceAll('_', ' '));
  }
  return parts.length ? `Changes ${parts.join(', ')}` : '';
}

function approvalSummary(row: Row, names: Map<string, string>, caseTitles: Map<string, string>, caseByDocument: Map<number, { id: string; title: string }>): Pick<InboxApproval, 'title' | 'meta' | 'detail' | 'href' | 'hrefLabel' | 'dueAt' | 'priority' | 'amount'> {
  const payload = asRow(row.payload);
  const patch = asRow(payload.patch);
  const reason = cleanText(payload.reason);
  const base = { href: null, hrefLabel: null, dueAt: null, priority: null, amount: null };
  switch (row.action_type) {
    case 'action.create': {
      const documentId = Number(payload.paperlessDocumentId) || null;
      const summary = cleanText(payload.summary);
      // A document carries one action. When it already has one, approving would be refused, so say it up front.
      const existing = documentId ? caseByDocument.get(documentId) : undefined;
      return {
        ...base,
        title: cleanText(payload.title) || 'New action',
        meta: documentId ? `New action for document #${documentId}` : 'New action',
        detail: existing ? `Document #${documentId} already has the action “${existing.title}”.` : summary,
        href: existing ? `/actions/${existing.id}` : documentId ? `/documents/${documentId}` : null,
        hrefLabel: existing ? 'Open the existing action' : documentId ? `Document #${documentId}` : null,
        dueAt: payload.dueAt ? String(payload.dueAt).slice(0, 10) : null,
        priority: PRIORITIES.has(String(payload.priority)) ? payload.priority as InboxPriority : null,
        amount: extractAmount(cleanText(payload.title), summary)
      };
    }
    case 'action.update': {
      const caseId = String(payload.caseId || '');
      const caseTitle = caseTitles.get(caseId);
      return {
        ...base,
        title: caseTitle ? `Update “${caseTitle}”` : 'Update an action',
        meta: 'Action',
        detail: describePatch(patch, names),
        href: caseTitle ? `/actions/${caseId}` : null,
        hrefLabel: caseTitle ? 'Open the action' : null,
        dueAt: patch.dueAt ? String(patch.dueAt).slice(0, 10) : null,
        priority: PRIORITIES.has(String(patch.priority)) ? patch.priority as InboxPriority : null
      };
    }
    case 'paperless.patch': {
      const documentId = Number(payload.documentId) || null;
      return {
        ...base,
        title: `Update ${cleanText(payload.documentTitle) || `document #${documentId}`}`,
        meta: 'Paperless document',
        detail: reason || describePatch(patch, names),
        href: documentId ? `/documents/${documentId}` : null,
        hrefLabel: documentId ? `Document #${documentId}` : null
      };
    }
    case 'paperless.tag.create':
      return { ...base, title: `Create tag “${cleanText(payload.name, 80) || 'New tag'}”`, meta: 'Paperless tag', detail: reason, href: '/tags', hrefLabel: 'Tags' };
    case 'paperless.tag.update':
      return { ...base, title: `Update tag “${cleanText(payload.tagName, 80) || `#${payload.tagId}`}”`, meta: 'Paperless tag', detail: reason, href: '/tags', hrefLabel: 'Tags' };
    case 'paperless.tag.delete':
      return { ...base, title: `Delete tag “${cleanText(payload.tagName, 80) || `#${payload.tagId}`}”`, meta: 'Paperless tag', detail: reason, href: '/tags', hrefLabel: 'Tags' };
    default:
      return { ...base, title: 'Change waiting for approval', meta: 'Approval', detail: reason };
  }
}

export type CaseIndex = { titles: Map<string, string>; byDocument: Map<number, { id: string; title: string }> };

export function approvalFromRow(row: Row, names: Map<string, string>, index: CaseIndex): InboxApproval {
  return {
    id: String(row.id),
    ...approvalSummary(row, names, index.titles, index.byDocument),
    requestedById: row.requested_by_member_id ? String(row.requested_by_member_id) : null,
    requestedByName: row.requested_by_member_id ? names.get(String(row.requested_by_member_id)) || null : null,
    requestedOn: zurichDateOf(String(row.created_at || ''))
  };
}

export function loadCaseIndex(workspace: Workspace): CaseIndex {
  const rows = actionCenter.listCases(workspace.householdId) as Row[];
  return {
    titles: new Map(rows.map((row) => [String(row.id), cleanText(row.title)])),
    byDocument: new Map(rows.map((row) => [Number(row.paperlessDocumentId), { id: String(row.id), title: cleanText(row.title) }]))
  };
}

/** Approvals of the household that still wait for a decision, newest first. */
export function loadPendingApprovals(workspace: Workspace, names: Map<string, string>): InboxApproval[] {
  const index = loadCaseIndex(workspace);
  return (actionCenter.listApprovals(workspace.householdId) as Row[]).map((row) => approvalFromRow(row, names, index));
}

function parseObject(value: unknown): Row {
  if (typeof value !== 'string') return asRow(value);
  try { return asRow(JSON.parse(value)); } catch { return {}; }
}

async function loadReviews(): Promise<{ reviews: InboxReview[]; total: number }> {
  try {
    const rows = (await documentModel.listPendingReviewSuggestions(200)) as Row[];
    const reviews = rows.slice(0, REVIEW_LIMIT).map((row): InboxReview => {
      const proposed = parseObject(row.proposed_metadata);
      const changes = Object.entries(proposed)
        .filter(([, value]) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0))
        .map(([key]) => FIELD_LABELS[key] || key.replaceAll('_', ' '));
      return {
        id: Number(row.id),
        documentId: Number(row.document_id),
        title: cleanText(proposed.title ?? row.title) || `Document #${row.document_id}`,
        changes,
        stagedOn: zurichDateOf(String(row.staged_at || row.created_at || ''))
      };
    });
    return { reviews, total: rows.length };
  } catch {
    // The feed stays useful when the review queue tables are not readable.
    return { reviews: [], total: 0 };
  }
}

/** Active cases plus the ones finished within the last seven days. */
export function loadCases(workspace: Workspace, weekAgo: string, assignee?: string): InboxCase[] {
  const cases: InboxCase[] = [];
  for (const row of actionCenter.listCases(workspace.householdId, assignee ? { assignee } : {}) as Row[]) {
    const item = caseFromRow(row);
    if (ACTIVE.has(item.status) || (item.status === 'done' && item.doneAt && item.doneAt >= weekAgo)) cases.push(item);
  }
  return cases;
}

/** Reads everything the "Needs you" feed shows for the signed-in member's own household. */
export async function loadInbox(workspace: Workspace, today: string, initialFilter: string): Promise<InboxData> {
  const { members, me, names } = loadMembers(workspace);
  const canDecide = workspace.role === 'owner' || workspace.role === 'adult';
  const review = canDecide ? await loadReviews() : { reviews: [], total: 0 };
  const known = initialFilter === 'mine' || initialFilter === 'done' || members.some((member) => member.id === initialFilter);
  return {
    today,
    householdName: workspace.name,
    me,
    members,
    cases: loadCases(workspace, addDays(today, -7)),
    approvals: loadPendingApprovals(workspace, names),
    reviews: review.reviews,
    reviewTotal: review.total,
    canMutate: workspace.role !== 'viewer',
    canDecide,
    initialFilter: known ? initialFilter : 'all'
  };
}
