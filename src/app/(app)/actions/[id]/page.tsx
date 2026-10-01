import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { zurichToday } from '@/components/inbox/dates';
import { CaseDetail, type CaseRecord } from '@/components/inbox/case-detail';
import { loadMembers } from '@/components/inbox/load-inbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Action' };

export default async function ActionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { id } = await params;
  const item = actionCenter.getCase(workspace.householdId, id);
  if (!item) notFound();
  const { members } = loadMembers(workspace);
  return <CaseDetail
    key={id}
    initial={JSON.parse(JSON.stringify(item)) as CaseRecord}
    members={members}
    today={zurichToday()}
    canMutate={workspace.role !== 'viewer'}
  />;
}
