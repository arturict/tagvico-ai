import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { addDays } from '@/components/inbox/dates';
import { InboxFeed } from '@/components/inbox/inbox-feed';
import { loadInbox } from '@/components/inbox/load-inbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Needs you' };

export default async function InboxPage() {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const today = new Date().toISOString().slice(0, 10);
  const data = await loadInbox(workspace, today, addDays(today, -7));
  return <InboxFeed data={data} />;
}
