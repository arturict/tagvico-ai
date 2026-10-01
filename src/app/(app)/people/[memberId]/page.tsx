import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { zurichToday } from '@/components/inbox/dates';
import { loadPerson } from '@/components/people/load-person';
import { MemberWorkload } from '@/components/people/member-workload';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

export default async function PersonPage({ params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { memberId } = await params;
  const data = loadPerson(workspace, memberId, zurichToday());
  if (!data) notFound();
  return <MemberWorkload key={memberId} data={data} />;
}
