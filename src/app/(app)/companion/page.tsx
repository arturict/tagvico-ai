import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { getHouseholdNavigation } from '@/lib/server/household-navigation';
import { listSessionApprovals } from '@/lib/server/agent/session-approvals';
import { loadChatStart } from '@/lib/server/agent/chat-start';
import { Companion } from '@/components/companion';
import { dayPart } from '@/components/chat/greeting';
import type { UIMessage } from 'ai';
import type { CompanionToolActivity } from '@root/contracts/companion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Chat' };

type SessionRow = { id: string; title: string; preview?: string; message_count?: number; updated_at: string };

function chatUrl(sessionId: string, welcome: boolean) {
  return `/companion?chat=${encodeURIComponent(sessionId)}${welcome ? '&welcome=1' : ''}`;
}

export default async function CompanionPage({
  searchParams
}: {
  searchParams: Promise<{ chat?: string; welcome?: string; new?: string }>;
}) {
  const user = await requireUser(); const workspace = workspaceFor(user);
  const params = await searchParams;
  const welcome = params.welcome === '1';
  const sessions = actionCenter.listSessions(workspace.householdId, workspace.memberId, 'web') as SessionRow[];

  const requestedSessionId = String(params.chat || '').trim();
  const requestedSession = requestedSessionId
    ? actionCenter.getSession(workspace.householdId, requestedSessionId) as { member_id?: unknown } | null
    : null;
  if (!requestedSession || requestedSession.member_id !== workspace.memberId) {
    // The start page and "New chat" open an empty conversation: the newest
    // one when it is still empty, otherwise a fresh one. The address then
    // names the conversation, so a reload keeps it.
    const newest = sessions[0];
    const reusable = newest && Number(newest.message_count) === 0 ? newest.id : null;
    redirect(chatUrl(reusable || actionCenter.createSession(workspace.householdId, workspace.memberId, 'web'), welcome));
  }
  const sessionId = requestedSessionId;
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
  const members = actionCenter.listMembers(workspace.householdId) as Array<{ id: string; display_name?: string; role?: string }>;
  const member = members.find((candidate) => candidate.id === workspace.memberId);
  const displayName = String(member?.display_name || user.username).trim() || user.username;
  const approverNames = members
    .filter((candidate) => ['owner', 'adult'].includes(String(candidate.role)))
    .map((candidate) => String(candidate.display_name || '').trim())
    .filter(Boolean);
  const isEmpty = !initialMessages.length;
  const [navigation, start] = await Promise.all([
    getHouseholdNavigation(user).catch(() => null),
    isEmpty ? loadChatStart(workspace.householdId, workspace.memberId) : Promise.resolve(null)
  ]);
  return <Companion
    key={sessionId}
    sessionId={sessionId}
    displayName={displayName}
    initialMessages={initialMessages}
    initialApprovals={listSessionApprovals(workspace.householdId, sessionId)}
    canApprove={['owner', 'adult'].includes(workspace.role)}
    isOwner={workspace.role === 'owner'}
    approverNames={approverNames}
    needsCount={navigation?.needsYouCount ?? 0}
    start={start}
    dayPart={dayPart(new Date())}
    showFirstRun={welcome}
  />;
}
