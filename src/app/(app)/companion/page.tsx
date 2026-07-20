import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { Companion } from '@/components/companion';
import type { UIMessage } from 'ai';

export const dynamic = 'force-dynamic';
export default async function CompanionPage() {
  const user = await requireUser(); const workspace = workspaceFor(user);
  const sessionId = actionCenter.getOrCreateSession(workspace.householdId, workspace.memberId, 'web');
  const session = actionCenter.getSession(workspace.householdId, sessionId) as { messages?: Array<{ id: string; role: string; content?: { text?: unknown } }> } | null;
  const initialMessages: UIMessage[] = (session?.messages || [])
    .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content?.text === 'string')
    .map((message) => ({ id: message.id, role: message.role as 'user' | 'assistant', parts: [{ type: 'text', text: String(message.content?.text) }] }));
  const approvals = actionCenter.listApprovals(workspace.householdId) as Array<Record<string, unknown>>;
  return <div className="page"><header className="page-head"><div><p className="eyebrow">AI with a seatbelt</p><h1>Household companion</h1><p className="lede">Ask about letters, deadlines, bills and contracts. Reading is immediate; every change waits for an owner or adult to approve it.</p></div></header><Companion sessionId={sessionId} initialMessages={initialMessages} initialApprovals={JSON.parse(JSON.stringify(approvals))} canApprove={['owner', 'adult'].includes(workspace.role)} /></div>;
}
