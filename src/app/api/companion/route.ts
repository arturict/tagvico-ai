import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { streamCompanion } from '@/lib/server/agent/session-runtime';
import companionModelService from '@root/services/companionModelService';
import type { CompanionModelSelection } from '@root/contracts/companion';
import { safeValidateUIMessages, type UIMessage } from 'ai';
import crypto from 'node:crypto';
import { NO_PROVIDER_MESSAGE, describeCompanionModelError, encodeCompanionError } from '@root/contracts/companion';

export const maxDuration = 120;
export async function GET() {
  try {
    const user = await requireApiUser(); const workspace = workspaceFor(user);
    const sessionId = actionCenter.getOrCreateSession(workspace.householdId, workspace.memberId, 'web');
    return Response.json({ sessionId });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await assertSameOrigin(request); const user = await requireApiUser(); const workspace = workspaceFor(user);
    const body = await readJsonBody<Record<string, unknown>>(request, 512 * 1024); const sessionId = String(body.sessionId || '');
    const session = actionCenter.getSession(workspace.householdId, sessionId) as { member_id?: unknown; messages?: Array<{ id: string; role: string; content?: { text?: unknown } }> } | null;
    if (!session || session.member_id !== workspace.memberId) throw new ApiError(404, 'Companion session not found');
    const validated = await safeValidateUIMessages<UIMessage>({ messages: Array.isArray(body.messages) ? body.messages.slice(-1) : [] });
    if (!validated.success) throw new ApiError(400, 'Invalid companion message format');
    const messages = validated.data;
    const last = messages.at(-1); if (!last || last.role !== 'user') throw new ApiError(400, 'A user message is required');
    const lastText = last.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n').slice(0, 12_000);
    if (!lastText) throw new ApiError(400, 'A text message is required');
    const storedMessages: UIMessage[] = (session.messages || [])
      .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content?.text === 'string')
      .map((message) => ({ id: message.id, role: message.role as 'user' | 'assistant', parts: [{ type: 'text', text: String(message.content?.text) }] }));
    // "Try again" after a failed answer resends the same question: it is already stored, so it is not stored twice.
    const lastStored = storedMessages.at(-1);
    const isRetry = lastStored?.role === 'user'
      && lastStored.parts.some((part) => part.type === 'text' && part.text === lastText);
    const userMessage: UIMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: lastText }] };
    const history = (isRetry ? storedMessages : [...storedMessages, userMessage]).slice(-30);
    const catalog = await companionModelService.getCompanionModelCatalog();
    const storedSelection = actionCenter.getCompanionModelSelection(
      workspace.householdId,
      sessionId
    ) as CompanionModelSelection | null;
    const selection = companionModelService.selectionIsAvailable(catalog, storedSelection)
      ? storedSelection
      : catalog.defaultSelection;
    if (!selection) {
      return Response.json({
        error: NO_PROVIDER_MESSAGE,
        code: 'no-provider'
      }, { status: 409 });
    }
    if (!isRetry) actionCenter.addMessage(sessionId, 'user', { text: lastText });
    return await streamCompanion(
      { householdId: workspace.householdId, memberId: workspace.memberId, sessionId },
      history,
      request.signal,
      selection
    );
  } catch (error) {
    // Failures before the stream starts (for example a missing key) never reach the stream's own error handler.
    if (error instanceof ApiError) return apiError(error);
    const view = describeCompanionModelError(error);
    return new Response(encodeCompanionError(view), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}
