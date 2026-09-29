import 'server-only';
import documentModel from '../../../models/document';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import type { InboxApproval, InboxCase, InboxCaseStatus, InboxData, InboxMember, InboxPriority } from './types';

type Row = Record<string, any>;
type Workspace = ReturnType<typeof workspaceFor>;

const ACTIVE = new Set<string>(['suggested', 'open', 'waiting']);
const PRIORITIES = new Set<string>(['low', 'normal', 'high', 'urgent']);

function text(value: unknown, max = 240) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function approvalSummary(row: Row): Pick<InboxApproval, 'title' | 'meta' | 'detail'> {
  const payload: Row = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const patch: Row = payload.patch && typeof payload.patch === 'object' ? payload.patch : {};
  const fields = Object.keys(patch);
  const reason = text(payload.reason);
  switch (row.action_type) {
    case 'action.create':
      return {
        title: text(payload.title) || 'New action',
        meta: payload.paperlessDocumentId ? `New action for document #${payload.paperlessDocumentId}` : 'New action',
        detail: text(payload.summary)
      };
    case 'action.update':
      return { title: 'Update an action', meta: 'Action', detail: fields.length ? `Changes ${fields.join(', ')}` : '' };
    case 'paperless.patch':
      return {
        title: `Update ${text(payload.documentTitle) || `document #${payload.documentId}`}`,
        meta: 'Paperless document',
        detail: reason || (fields.length ? `Changes ${fields.join(', ')}` : '')
      };
    case 'paperless.tag.create':
      return { title: `Create tag “${text(payload.name, 80) || 'New tag'}”`, meta: 'Paperless tag', detail: reason };
    case 'paperless.tag.update':
      return { title: `Update tag “${text(payload.tagName, 80) || `#${payload.tagId}`}”`, meta: 'Paperless tag', detail: reason };
    case 'paperless.tag.delete':
      return { title: `Delete tag “${text(payload.tagName, 80) || `#${payload.tagId}`}”`, meta: 'Paperless tag', detail: reason };
    default:
      return { title: 'Change waiting for approval', meta: 'Approval', detail: reason };
  }
}

async function pendingReviewCount() {
  try {
    return (await documentModel.listPendingReviewSuggestions(200)).length;
  } catch {
    // The feed stays useful when the review queue tables are not readable.
    return 0;
  }
}

/** Reads everything the "Needs you" feed shows for the signed-in member's own household. */
export async function loadInbox(workspace: Workspace, today: string, weekAgo: string): Promise<InboxData> {
  const members = (actionCenter.listMembers(workspace.householdId) as Row[]).map((member): InboxMember => ({
    id: String(member.id),
    name: String(member.display_name),
    role: String(member.role)
  }));
  const names = new Map(members.map((member) => [member.id, member.name]));
  const me = members.find((member) => member.id === workspace.memberId) || { id: workspace.memberId, name: 'You', role: workspace.role };

  const cases: InboxCase[] = [];
  for (const row of actionCenter.listCases(workspace.householdId) as Row[]) {
    const status = String(row.status);
    const updated = String(row.updated_at || '').slice(0, 10);
    const isRecentDone = status === 'done' && updated >= weekAgo;
    if (!ACTIVE.has(status) && !isRecentDone) continue;
    cases.push({
      id: String(row.id),
      title: text(row.title),
      summary: text(row.summary, 400),
      status: status as InboxCaseStatus,
      priority: (PRIORITIES.has(String(row.priority)) ? row.priority : 'normal') as InboxPriority,
      dueAt: row.dueAt ? String(row.dueAt).slice(0, 10) : null,
      assigneeId: row.assigneeMemberId ? String(row.assigneeMemberId) : null,
      documentId: Number(row.paperlessDocumentId) || null,
      doneAt: status === 'done' ? updated : null
    });
  }

  const approvals: InboxApproval[] = (actionCenter.listApprovals(workspace.householdId) as Row[]).map((row) => ({
    id: String(row.id),
    ...approvalSummary(row),
    requestedById: row.requested_by_member_id ? String(row.requested_by_member_id) : null,
    requestedByName: row.requested_by_member_id ? names.get(String(row.requested_by_member_id)) || null : null
  }));

  return {
    today,
    householdName: workspace.name,
    me,
    members,
    cases,
    approvals,
    reviewCount: await pendingReviewCount(),
    canMutate: workspace.role !== 'viewer',
    canDecide: workspace.role === 'owner' || workspace.role === 'adult'
  };
}
