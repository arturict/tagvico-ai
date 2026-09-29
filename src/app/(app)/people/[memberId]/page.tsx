import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { MemberAvatar } from '@/components/member-avatar';
import { MemberWorkload, type WorkloadApproval, type WorkloadCase } from '@/components/people/member-workload';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

const ACTIVE_STATUSES = new Set(['suggested', 'open', 'waiting']);
const APPROVAL_STATUSES = ['pending', 'approved', 'executed', 'rejected', 'failed'] as const;

function approvalTitle(actionType: string, payload: Record<string, unknown>) {
  switch (actionType) {
    case 'paperless.tag.create': return `Create tag “${String(payload.name || 'New tag')}”`;
    case 'paperless.tag.update': return `Update tag “${String(payload.tagName || `#${payload.tagId}`)}”`;
    case 'paperless.tag.delete': return `Delete tag “${String(payload.tagName || `#${payload.tagId}`)}”`;
    case 'paperless.patch': return `Update ${String(payload.documentTitle || `document #${payload.documentId}`)}`;
    case 'action.create': return `New action: ${String(payload.title || 'Untitled')}`;
    default: return 'Update an action';
  }
}

export default async function PersonPage({ params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { memberId } = await params;
  const members = actionCenter.listMembers(workspace.householdId) as Array<Record<string, unknown>>;
  const member = members.find((candidate) => String(candidate.id) === memberId);
  if (!member) notFound();

  const name = String(member.display_name);
  const cases: WorkloadCase[] = (actionCenter.listCases(workspace.householdId, { assignee: memberId }) as Array<Record<string, unknown>>)
    .filter((item) => ACTIVE_STATUSES.has(String(item.status)))
    .map((item) => ({
      id: String(item.id),
      title: String(item.title),
      status: String(item.status),
      priority: String(item.priority),
      dueAt: item.dueAt ? String(item.dueAt) : null,
      paperlessDocumentId: Number(item.paperlessDocumentId)
    }));
  const approvals: WorkloadApproval[] = APPROVAL_STATUSES
    .flatMap((status) => actionCenter.listApprovals(workspace.householdId, status) as Array<Record<string, unknown>>)
    .filter((approval) => String(approval.requested_by_member_id) === memberId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10)
    .map((approval) => ({
      id: String(approval.id),
      title: approvalTitle(String(approval.action_type), approval.payload && typeof approval.payload === 'object' ? approval.payload as Record<string, unknown> : {}),
      status: String(approval.status),
      createdAt: String(approval.created_at)
    }));

  return <div className="page">
    <header className="people-head">
      <MemberAvatar name={name} memberId={memberId} size={56} />
      <div>
        <p className="eyebrow">{workspace.name}</p>
        <h1>{name}</h1>
        <p className="lede">{String(member.role)} · {cases.length} open</p>
      </div>
    </header>
    <MemberWorkload cases={cases} approvals={approvals} name={name} />
  </div>;
}
