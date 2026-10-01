import 'server-only';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { addDays, zurichDateOf } from '@/components/inbox/dates';
import { approvalFromRow, loadCases, loadCaseIndex, loadMembers } from '@/components/inbox/load-inbox';
import type { InboxApproval, InboxCase, InboxMember } from '@/components/inbox/types';

type Row = Record<string, unknown>;
const SETTLED = ['approved', 'executed', 'rejected', 'failed'] as const;

export type RequestedChange = {
  id: string;
  title: string;
  status: (typeof SETTLED)[number];
  /** Zurich calendar date of the decision, or of the request when none was recorded. */
  on: string | null;
  /** The real reason when Paperless or Tagvico refused to apply an approved change. */
  error: string | null;
};

export type PersonData = {
  today: string;
  householdName: string;
  member: InboxMember & { paperlessUserId: number | null; paperlessConfigured: boolean };
  isMe: boolean;
  members: InboxMember[];
  cases: InboxCase[];
  pendingApprovals: InboxApproval[];
  history: RequestedChange[];
  canMutate: boolean;
  canDecide: boolean;
  /** Owners configure anyone's Paperless access, everyone else only their own. */
  canEditAccess: boolean;
};

function failureReason(row: Row) {
  if (row.status !== 'failed' || typeof row.result_json !== 'string') return null;
  try {
    const result = JSON.parse(row.result_json) as Row;
    return typeof result.error === 'string' ? result.error : null;
  } catch {
    return null;
  }
}

/** Everything the person page shows, or null when the id belongs to nobody in this household. */
export function loadPerson(workspace: ReturnType<typeof workspaceFor>, memberId: string, today: string): PersonData | null {
  const { members, names } = loadMembers(workspace);
  const person = (actionCenter.listMembers(workspace.householdId) as Row[]).find((row) => String(row.id) === memberId);
  if (!person) return null;
  const caseIndex = loadCaseIndex(workspace);
  const requestedBy = (row: Row) => String(row.requested_by_member_id) === memberId;

  const pendingApprovals = (actionCenter.listApprovals(workspace.householdId) as Row[])
    .filter(requestedBy)
    .map((row) => approvalFromRow(row, names, caseIndex));
  const history = SETTLED
    .flatMap((status) => actionCenter.listApprovals(workspace.householdId, status) as Row[])
    .filter(requestedBy)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10)
    .map((row): RequestedChange => ({
      id: String(row.id),
      title: approvalFromRow(row, names, caseIndex).title,
      status: row.status as RequestedChange['status'],
      on: zurichDateOf(String(row.decided_at || row.created_at || '')),
      error: failureReason(row)
    }));

  return {
    today,
    householdName: workspace.name,
    member: {
      id: memberId,
      name: String(person.display_name),
      role: String(person.role),
      paperlessUserId: Number(person.paperless_user_id) || null,
      paperlessConfigured: Boolean(person.paperless_configured)
    },
    isMe: memberId === workspace.memberId,
    members,
    cases: loadCases(workspace, addDays(today, -7), memberId),
    pendingApprovals,
    history,
    canMutate: workspace.role !== 'viewer',
    canDecide: workspace.role === 'owner' || workspace.role === 'adult',
    canEditAccess: workspace.role === 'owner' || memberId === workspace.memberId
  };
}
