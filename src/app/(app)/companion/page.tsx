import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { Companion } from '@/components/companion';
import type { UIMessage } from 'ai';
import type { CompanionToolActivity } from '@root/contracts/companion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask Tagvico' };
export default async function CompanionPage({
  searchParams
}: {
  searchParams: Promise<{ chat?: string; welcome?: string }>;
}) {
  const user = await requireUser(); const workspace = workspaceFor(user);
  const params = await searchParams;
  const requestedSessionId = String(params.chat || '').trim();
  const requestedSession = requestedSessionId
    ? actionCenter.getSession(workspace.householdId, requestedSessionId) as { member_id?: unknown } | null
    : null;
  const sessionId = requestedSession?.member_id === workspace.memberId
    ? requestedSessionId
    : actionCenter.getOrCreateSession(workspace.householdId, workspace.memberId, 'web');
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
  const member = (actionCenter.listMembers(workspace.householdId) as Array<{ id: string; display_name?: string }>)
    .find((candidate) => candidate.id === workspace.memberId);
  const displayName = String(member?.display_name || user.username).trim() || user.username;
  const approvals = actionCenter.listApprovals(workspace.householdId) as Array<Record<string, unknown>>;
  const sessions = actionCenter.listSessions(workspace.householdId, workspace.memberId, 'web') as Array<Record<string, unknown>>;
  return <div className="page chat-page"><Companion
    sessionId={sessionId}
    displayName={displayName}
    initialMessages={initialMessages}
    initialApprovals={JSON.parse(JSON.stringify(approvals))}
    initialSessions={JSON.parse(JSON.stringify(sessions))}
    canApprove={['owner', 'adult'].includes(workspace.role)}
    renderedAt={Date.now()}
    showFirstRun={params.welcome === '1'}
  /></div>;
}
