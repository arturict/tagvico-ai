import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { Companion } from '@/components/companion';
import type { UIMessage } from 'ai';
import type { CompanionToolActivity } from '@root/contracts/companion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask Tagvico' };
export default async function CompanionPage() {
  const user = await requireUser(); const workspace = workspaceFor(user);
  const sessionId = actionCenter.getOrCreateSession(workspace.householdId, workspace.memberId, 'web');
  const session = actionCenter.getSession(workspace.householdId, sessionId) as {
    messages?: Array<{
      id: string;
      role: string;
      content?: { text?: unknown; activities?: unknown }
    }>
  } | null;
  const initialMessages: UIMessage[] = (session?.messages || [])
    .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content?.text === 'string')
    .map((message) => {
      const activities = Array.isArray(message.content?.activities)
        ? message.content.activities.filter((activity): activity is CompanionToolActivity => {
            if (!activity || typeof activity !== 'object') return false;
            const candidate = activity as Record<string, unknown>;
            return typeof candidate.label === 'string'
              && typeof candidate.detail === 'string'
              && ['running', 'succeeded', 'failed', 'waiting'].includes(String(candidate.status));
          })
        : [];
      return {
        id: message.id,
        role: message.role as 'user' | 'assistant',
        parts: [
          ...activities.map((activity) => ({
            type: 'data-companion-activity',
            data: activity
          } as UIMessage['parts'][number])),
          { type: 'text' as const, text: String(message.content?.text) }
        ]
      };
    });
  const approvals = actionCenter.listApprovals(workspace.householdId) as Array<Record<string, unknown>>;
  return <div className="page"><header className="page-head"><div><p className="eyebrow">Research with a seatbelt</p><h1>Ask Tagvico</h1><p className="lede">Research letters, deadlines, bills and contracts in Paperless. Reading is immediate; every change waits for an owner or adult to approve it.</p></div></header><Companion sessionId={sessionId} initialMessages={initialMessages} initialApprovals={JSON.parse(JSON.stringify(approvals))} canApprove={['owner', 'adult'].includes(workspace.role)} /></div>;
}
