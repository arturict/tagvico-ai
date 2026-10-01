'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage
} from 'ai';
import { useChat } from '@ai-sdk/react';
import { ArrowDown, Check, Clipboard } from 'lucide-react';
import {
  NO_PROVIDER_MESSAGE,
  companionDocumentIds,
  companionToolActivity,
  groundCompanionCitations,
  parseCompanionError,
  sanitizeCompanionText,
  type CompanionApprovalView,
  type CompanionToolActivity as CompanionToolActivityModel
} from '@root/contracts/companion';
import type { CompanionSuggestion } from '@root/services/companionResearchService';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse
} from '@/components/ai-elements/message';
import { ChatActivitySummary } from '@/components/chat/chat-activity-summary';
import { ChatApprovalCard } from '@/components/chat/chat-approval-card';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatEmptyState, ChatStarters, type ChatUrgentItem } from '@/components/chat/chat-empty-state';
import { ChatErrorNotice } from '@/components/chat/chat-error-notice';
import { ChatModelChip, type ModelChipState } from '@/components/chat/chat-model-chip';
import { ChatWorking } from '@/components/chat/chat-working';
import type { DayPart } from '@/components/chat/greeting';
import { useDraft } from '@/components/chat/use-draft';
import { OVERLAY_SELECTOR, shortcutAction } from '@/components/shell/shortcuts';
import { useOnline } from '@/components/shell/use-online';
import {
  CitationTitles,
  SourceChips,
  citationComponents,
  citedDocumentIds,
  citedDocuments,
  linkCitations
} from '@/components/chat/citations';

/** Tells the sidebar that its chat list changed (a chat was created, named by its first message, or deleted). */
function announceSessionsChanged() {
  window.dispatchEvent(new Event('tagvico:sessions-changed'));
}

/** One step of the assistant's work: what it did, its outcome, and the documents it found. */
function ToolActivityCard({ activity }: { activity: CompanionToolActivityModel }) {
  const query = String(activity.input?.query || '').trim();
  const documents = activity.result?.documents || [];
  const tags = activity.result?.tags || [];
  const status = activity.status === 'running'
    ? 'Running'
    : activity.status === 'succeeded'
      ? 'Done'
      : activity.status === 'failed'
        ? 'Failed'
        : 'Waiting';

  return <li className={`chat-step is-${activity.status}`}>
    <p className="chat-step-line">
      <strong>{activity.label}</strong>
      <span className="chat-step-status">{status}</span>
    </p>
    <p className="chat-step-detail">{activity.detail}</p>
    {query ? <p className="chat-step-detail">Search: {query}</p> : null}
    {documents.length ? <ul className="chat-step-items">
      {documents.map((document) => <li key={document.id}>
        <a href={`/documents/${document.id}`} target="_blank" rel="noreferrer">{document.title}</a>
        {document.created ? <small>{document.created}</small> : null}
      </li>)}
    </ul> : null}
    {tags.length ? <ul className="chat-step-items">
      {tags.map((tag) => <li key={tag.id}>
        <span>{tag.name}</span>
        {tag.documentCount !== undefined ? <small>{tag.documentCount} document{tag.documentCount === 1 ? '' : 's'}</small> : null}
      </li>)}
    </ul> : null}
  </li>;
}

function activityFromPart(part: UIMessage['parts'][number]): CompanionToolActivityModel | null {
  if (!isToolUIPart(part)) return storedActivity(part);
  return companionToolActivity(
    getToolName(part),
    part.state,
    'input' in part ? part.input : undefined,
    part.state === 'output-error' ? part.errorText : 'output' in part ? part.output : undefined
  );
}

function storedActivity(part: UIMessage['parts'][number]): CompanionToolActivityModel | null {
  if (part.type !== 'data-companion-activity' || !('data' in part)) return null;
  const activity = part.data;
  if (!activity || typeof activity !== 'object') return null;
  const candidate = activity as Record<string, unknown>;
  if (typeof candidate.label !== 'string' || typeof candidate.detail !== 'string') return null;
  if (!['running', 'succeeded', 'failed', 'waiting'].includes(String(candidate.status))) return null;
  return {
    toolName: typeof candidate.toolName === 'string' ? candidate.toolName : 'legacy',
    ...candidate
  } as CompanionToolActivityModel;
}

export function Companion({
  sessionId,
  displayName,
  initialMessages,
  initialApprovals,
  canApprove,
  isOwner,
  approverNames,
  needsCount: initialNeedsCount,
  start,
  dayPart,
  showFirstRun = false
}: {
  sessionId: string;
  displayName: string;
  initialMessages: UIMessage[];
  initialApprovals: CompanionApprovalView[];
  canApprove: boolean;
  isOwner: boolean;
  approverNames: string[];
  needsCount: number;
  start: {
    paperless: 'ok' | 'unreachable' | 'access';
    suggestions: CompanionSuggestion[];
    urgent?: ChatUrgentItem | null;
  } | null;
  /** Part of the day for the greeting, decided once on the server. */
  dayPart?: DayPart;
  showFirstRun?: boolean;
}) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [input, setInput] = useDraft(sessionId);
  const [notice, setNotice] = useState('');
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [decisionBusy, setDecisionBusy] = useState('');
  const [copiedMessage, setCopiedMessage] = useState('');
  const [needsCount, setNeedsCount] = useState(initialNeedsCount);
  const [modelState, setModelState] = useState<ModelChipState>('loading');
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  // Whether new content keeps the view at the bottom. Scrolling up during a long answer turns it off.
  const followEnd = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const online = useOnline();
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/companion', body: { sessionId } }),
    [sessionId]
  );
  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    clearError
  } = useChat({ id: sessionId, messages: initialMessages, transport });
  const isWorking = status === 'streaming' || status === 'submitted';
  const chatError = useMemo(() => error ? parseCompanionError(error.message) : null, [error]);
  const lastIsQuestion = messages.at(-1)?.role === 'user';
  const isEmpty = !messages.length;

  const scrollToEnd = useCallback(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, []);
  useEffect(() => {
    if (followEnd.current) scrollToEnd();
  }, [isWorking, messages, approvals, scrollToEnd]);
  const onThreadScroll = () => {
    const thread = threadRef.current;
    if (!thread) return;
    const nearEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    followEnd.current = nearEnd;
    setAtBottom(nearEnd);
  };

  // On a start page with a keyboard and mouse the message box is ready to type into; on phones the keyboard stays closed.
  useEffect(() => {
    if (initialMessages.length === 0 && window.matchMedia('(pointer: fine)').matches) composerRef.current?.focus({ preventScroll: true });
  }, [initialMessages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutAction(event, event.target as Element | null, {
        streaming: isWorking,
        overlayOpen: Boolean(document.querySelector(OVERLAY_SELECTOR))
      });
      if (action === 'focus-composer') {
        event.preventDefault();
        composerRef.current?.focus();
      } else if (action === 'stop-response') {
        event.preventDefault();
        void stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWorking, stop]);

  const refreshApprovals = useCallback(async () => {
    try {
      const response = await fetch(`/api/companion/approvals?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not refresh proposals');
      setApprovals(Array.isArray(body.approvals) ? body.approvals : []);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not refresh proposals');
    }
  }, [sessionId]);
  // The household-wide count is the one the sidebar shows; it changes when a
  // proposal is decided or a new one is prepared.
  const refreshNeedsYou = useCallback(async () => {
    try {
      const response = await fetch('/api/navigation/household', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => null) as { needsYouCount?: unknown } | null;
      const count = Number(body?.needsYouCount);
      if (Number.isSafeInteger(count) && count >= 0) setNeedsCount(count);
    } catch {
      // Keep the count from the page load.
    }
  }, []);

  // The sidebar lists the chats. An empty conversation was just created, and a
  // finished answer means the first message has named it, so it refreshes then.
  useEffect(() => {
    if (!initialMessages.length) announceSessionsChanged();
  }, [initialMessages.length]);
  const wasWorking = useRef(false);
  useEffect(() => {
    if (isWorking) {
      wasWorking.current = true;
      return;
    }
    if (!wasWorking.current) return;
    wasWorking.current = false;
    void refreshApprovals();
    void refreshNeedsYou();
    announceSessionsChanged();
  }, [isWorking, refreshApprovals, refreshNeedsYou]);

  const activitiesOf = useCallback((message: UIMessage) => message.parts
    .map(activityFromPart)
    .filter((activity): activity is CompanionToolActivityModel => Boolean(activity)), []);
  // Proposals this conversation made, in message order, so each card sits under the answer that prepared it.
  const proposalIds = useMemo(() => messages.flatMap((message) => message.role === 'assistant'
    ? activitiesOf(message).flatMap((activity) => activity.result?.approvalId ? [activity.result.approvalId] : [])
    : []), [messages, activitiesOf]);
  const missingProposal = proposalIds.find((id) => !approvals.some((approval) => approval.id === id)) || '';
  useEffect(() => {
    if (missingProposal) void refreshApprovals();
  }, [missingProposal, refreshApprovals]);

  const submitText = (text: string) => {
    const normalized = text.trim();
    if (!normalized || status !== 'ready' || modelState === 'none') return;
    setInput('');
    setNotice('');
    clearError();
    followEnd.current = true;
    setAtBottom(true);
    void sendMessage({ text: normalized });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitText(input);
  };
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setNotice('');
    setCardErrors((current) => ({ ...current, [id]: '' }));
    setDecisionBusy(id);
    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not record the decision');
    } catch (cause) {
      setCardErrors((current) => ({
        ...current,
        [id]: cause instanceof Error ? cause.message : 'Could not record the decision'
      }));
    } finally {
      // The server is the truth: a failed execution is stored on the approval, so refresh either way.
      await refreshApprovals();
      void refreshNeedsYou();
      setDecisionBusy('');
    }
  };
  const copyMessage = async (message: UIMessage) => {
    const text = message.parts
      .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
      .map((part) => sanitizeCompanionText(part.text))
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(message.id);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedMessage(''), 1_500);
    } catch {
      setNotice('Could not copy this answer. Select the text and copy it by hand instead.');
    }
  };

  const renderApproval = (approval: CompanionApprovalView) => <ChatApprovalCard
    key={approval.id}
    approval={approval}
    canApprove={canApprove}
    approverNames={approverNames}
    busy={decisionBusy === approval.id}
    error={cardErrors[approval.id]}
    onDecide={(decision) => void decide(approval.id, decision)}
  />;

  // Citations are only valid for documents a tool returned earlier in this
  // conversation; `seen` grows with each message so a later answer can still
  // cite a document found earlier.
  const seenActivities: CompanionToolActivityModel[] = [];
  const renderMessage = (message: UIMessage, messageIndex: number) => {
    const texts = message.parts.flatMap((part) => part.type === 'text' ? [part.text] : []);
    if (message.role === 'user') {
      return <div className="chat-turn is-user" key={message.id}>
        <Message from="user">
          <MessageContent>{texts.map((text, index) => <span key={index}>{text}</span>)}</MessageContent>
        </Message>
      </div>;
    }
    const activities = activitiesOf(message);
    seenActivities.push(...activities);
    const known = companionDocumentIds(seenActivities);
    const answers = texts.map((text) => groundCompanionCitations(sanitizeCompanionText(text), known));
    if (!activities.length && !answers.some(Boolean)) return null;
    const isLast = messageIndex === messages.length - 1;
    const citations = citedDocumentIds(answers.join('\n\n'));
    const sources = citedDocuments(citations, seenActivities);
    const titles = new Map(sources.map((source) => [source.id, source.title] as const));
    const proposals = activities.flatMap((activity) => {
      const approval = approvals.find((candidate) => candidate.id === activity.result?.approvalId);
      return approval ? [approval] : [];
    });
    return <div className="chat-turn is-assistant" key={message.id}>
      <Message from="assistant">
        <MessageContent>
          <ChatActivitySummary activities={activities}>
            {activities.map((activity, index) => <ToolActivityCard key={`${activity.toolName}-${index}`} activity={activity} />)}
          </ChatActivitySummary>
          <CitationTitles.Provider value={titles}>
            {answers.map((answer, index) => answer
              ? <MessageResponse
                key={index}
                components={citationComponents}
                isAnimating={isWorking && isLast}
              >{linkCitations(answer, citations)}</MessageResponse>
              : null)}
          </CitationTitles.Provider>
          <SourceChips documents={sources} />
        </MessageContent>
        {answers.some(Boolean) ? <MessageActions className="chat-message-actions">
          <MessageAction
            label={copiedMessage === message.id ? 'Copied' : 'Copy answer'}
            tooltip={copiedMessage === message.id ? 'Copied' : 'Copy answer'}
            onClick={() => void copyMessage(message)}
          >
            {copiedMessage === message.id ? <Check /> : <Clipboard />}
          </MessageAction>
          {copiedMessage === message.id ? <span className="chat-copied" role="status">Copied</span> : null}
        </MessageActions> : null}
        {proposals.length ? <div className="chat-proposals">{proposals.map(renderApproval)}</div> : null}
      </Message>
    </div>;
  };

  // Proposals created before cards were tied to messages still need a place.
  const looseApprovals = approvals.filter((approval) => approval.status === 'pending' && !proposalIds.includes(approval.id));
  const lastMessage = messages.at(-1);
  const answerStarted = lastMessage?.role === 'assistant'
    && lastMessage.parts.some((part) => part.type === 'text' && part.text.trim());
  const failure = chatError && !online && chatError.code === 'generic'
    ? { ...chatError, message: 'You are offline, so Tagvico could not reach the AI. Try again when your connection is back.' }
    : chatError;
  const visibleError = failure
    || (notice ? { code: 'generic' as const, message: notice } : null)
    || (modelState === 'none' ? { code: 'no-provider' as const, message: NO_PROVIDER_MESSAGE } : null);

  // One layout for both states, so the composer keeps its place (and focus)
  // when the first message turns the start page into a conversation: the
  // empty state centres greeting, composer and prompts as a group.
  return <div className="chat-page">
    <div className={`chat-shell${isEmpty ? ' is-empty' : ''}`}>
      <header className="chat-head">
        <ChatModelChip sessionId={sessionId} onState={setModelState} />
      </header>

      <div className="chat-thread" aria-live="polite" ref={threadRef} onScroll={onThreadScroll}>
        {isEmpty ? <ChatEmptyState
          displayName={displayName}
          dayPart={dayPart}
          paperless={start?.paperless ?? 'ok'}
          canManageSettings={isOwner}
          firstRun={showFirstRun ? {
            title: 'Start with one real question.',
            body: 'Your connections are ready. Ask a read-only question, open the cited Paperless source, then request an action. Tagvico will wait for approval before changing anything.'
          } : null}
        /> : <div className="chat-thread-inner">
          <h1 className="sr-only">Chat</h1>
          {messages.map(renderMessage)}
          {isWorking && !answerStarted ? <ChatWorking label={status === 'submitted' ? 'Thinking…' : 'Working on it…'} /> : null}
          {looseApprovals.map(renderApproval)}
        </div>}
      </div>

      <div className="chat-dock">
        {!isEmpty && !atBottom ? <button
          type="button"
          className="chat-scroll-down"
          aria-label="Scroll to the latest message"
          onClick={() => {
            followEnd.current = true;
            setAtBottom(true);
            scrollToEnd();
          }}
        ><ArrowDown aria-hidden="true" /></button> : null}
        {visibleError ? <ChatErrorNotice
          error={visibleError}
          canManageSettings={isOwner}
          onRetry={chatError && lastIsQuestion ? () => { clearError(); void regenerate(); } : undefined}
          onDismiss={() => { clearError(); setNotice(''); }}
        /> : null}
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onStop={() => void stop()}
          isWorking={isWorking}
          canSend={modelState !== 'none'}
          inputRef={composerRef}
        />
      </div>

      {isEmpty ? <ChatStarters
        needsCount={needsCount}
        urgent={start?.urgent ?? null}
        suggestions={start?.suggestions ?? []}
        onAsk={submitText}
      /> : null}

      <p className="chat-footnote">Tagvico can make mistakes. Changes need your approval.</p>
    </div>
  </div>;
}
