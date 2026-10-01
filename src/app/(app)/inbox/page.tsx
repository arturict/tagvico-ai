import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { zurichToday } from '@/components/inbox/dates';
import { InboxFeed } from '@/components/inbox/inbox-feed';
import { loadInbox } from '@/components/inbox/load-inbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Needs you' };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ for?: string | string[] }> }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const { for: requested } = await searchParams;
  const data = await loadInbox(workspace, zurichToday(), (Array.isArray(requested) ? requested[0] : requested) || 'all');
  return <InboxFeed key={workspace.householdId} data={data} />;
}
