import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { streamCompanion } from '@/lib/server/agent/session-runtime';
import { safeValidateUIMessages, type UIMessage } from 'ai';
import crypto from 'node:crypto';

export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    await assertSameOrigin(request); const user = await requireApiUser(); const workspace = workspaceFor(user);
    const body = await readJsonBody<Record<string, unknown>>(request, 512 * 1024); const sessionId = String(body.sessionId || '');
    const session = actionCenter.getSession(workspace.householdId, sessionId) as { member_id?: unknown; messages?: Array<{ id: string; role: string; content?: { text?: unknown } }> } | null;
    if (!session || String(session.member_id || '') !== workspace.memberId) throw new ApiError(404, 'Companion session not found');
    const validated = await safeValidateUIMessages<UIMessage>({ messages: Array.isArray(body.messages) ? body.messages.slice(-1) : [] });
    if (!validated.success) throw new ApiError(400, 'Invalid companion message format');
    const messages = validated.data;
    const last = messages.at(-1); if (!last || last.role !== 'user') throw new ApiError(400, 'A user message is required');
    const lastText = last.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n').slice(0, 12_000);
    if (!lastText) throw new ApiError(400, 'A text message is required');
    const storedMessages: UIMessage[] = (session.messages || [])
      .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content?.text === 'string')
      .map((message) => ({ id: message.id, role: message.role as 'user' | 'assistant', parts: [{ type: 'text', text: String(message.content?.text) }] }));
    const userMessage: UIMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: lastText }] };
    const history = [...storedMessages, userMessage].slice(-30);
    actionCenter.addMessage(sessionId, 'user', { text: lastText });
    return await streamCompanion({ householdId: workspace.householdId, memberId: workspace.memberId, sessionId }, history, request.signal);
  } catch (error) { return apiError(error); }
}
