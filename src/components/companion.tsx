'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage
} from 'ai';
import { useChat } from '@ai-sdk/react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clipboard,
  History,
  Inbox,
  LoaderCircle,
  MessageSquarePlus,
  ShieldCheck
} from 'lucide-react';
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
import { ChatEmptyState } from '@/components/chat/chat-empty-state';
import { ChatErrorNotice } from '@/components/chat/chat-error-notice';
import { ChatHistoryPanel } from '@/components/chat/chat-history-panel';
import type { ModelChipState } from '@/components/chat/chat-model-chip';
import {
  SourceChips,
  citationComponents,
  citedDocumentIds,
  citedDocuments,
  linkCitations
} from '@/components/chat/citations';

type SessionSummary = {
  id: string;
  title: string;
  preview?: string;
  message_count?: number;
  updated_at: string;
};

function relativeDate(value: string, renderedAt: number) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const timestamp = new Date(normalized).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.round((timestamp - renderedAt) / 60_000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return formatter.format(days, 'day');
}

function ToolActivityCard({ activity }: { activity: CompanionToolActivityModel }) {
  const Icon = activity.status === 'running'
    ? LoaderCircle
    : activity.status === 'succeeded'
      ? CheckCircle2
      : activity.status === 'failed'
        ? CircleAlert
        : ShieldCheck;
  const query = String(activity.input?.query || '').trim();
  const documents = activity.result?.documents || [];
  const tags = activity.result?.tags || [];
  const hasDetails = Boolean(query || documents.length || tags.length || activity.result?.count !== undefined);

  return <details className={`companion-tool is-${activity.status}`} open={activity.status === 'failed'}>
    <summary>
      <Icon className={activity.status === 'running' ? 'is-spinning' : undefined} aria-hidden="true" />
      <span>
        <strong>{activity.label}</strong>
        <small>{activity.detail}</small>
      </span>
      <span className="companion-tool-status">
        {activity.status === 'running'
          ? 'Running'
          : activity.status === 'succeeded'
            ? 'Done'
            : activity.status === 'failed'
              ? 'Failed'
              : 'Waiting'}
      </span>
      {hasDetails ? <ChevronRight className="companion-tool-chevron" aria-hidden="true" /> : null}
    </summary>
    {hasDetails ? <div className="companion-tool-details">
      {query ? <p><span>Search</span>{query}</p> : null}
      {activity.result?.count !== undefined ? <p><span>Result</span>{activity.result.count} item{activity.result.count === 1 ? '' : 's'}</p> : null}
      {documents.length ? <ul>
        {documents.map((document) => <li key={document.id}>
          <a className="companion-document-id" href={`/documents/${document.id}`} target="_blank" rel="noreferrer" aria-label={`Open source document ${document.id}`}>#{document.id}</a>
          <strong><a href={`/documents/${document.id}`} target="_blank" rel="noreferrer">{document.title}</a></strong>
          {document.created ? <small>{document.created}</small> : null}
        </li>)}
      </ul> : null}
      {tags.length ? <ul>
        {tags.map((tag) => <li key={tag.id}>
          <span className="companion-document-id">#{tag.id}</span>
          <strong>{tag.name}</strong>
          {tag.documentCount !== undefined ? <small>{tag.documentCount} document{tag.documentCount === 1 ? '' : 's'}</small> : null}
        </li>)}
      </ul> : null}
      <small className="companion-tool-privacy">Only safe metadata is shown here. Document text stays inside the selected model runtime.</small>
    </div> : null}
  </details>;
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
  initialSessions,
  canApprove,
  isOwner,
  approverNames,
  needsCount: initialNeedsCount,
  start,
  renderedAt,
  showFirstRun = false
}: {
  sessionId: string;
  displayName: string;
  initialMessages: UIMessage[];
  initialApprovals: CompanionApprovalView[];
  initialSessions: SessionSummary[];
  canApprove: boolean;
  isOwner: boolean;
  approverNames: string[];
  needsCount: number;
  start: { paperless: 'ok' | 'unreachable' | 'access'; suggestions: CompanionSuggestion[] } | null;
  renderedAt: number;
  showFirstRun?: boolean;
}) {
  const router = useRouter();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [sessions, setSessions] = useState(initialSessions);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [decisionBusy, setDecisionBusy] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState('');
  const [needsCount, setNeedsCount] = useState(initialNeedsCount);
  const [modelState, setModelState] = useState<ModelChipState>('loading');
  const [referenceTime, setReferenceTime] = useState(renderedAt);
  const endRef = useRef<HTMLDivElement>(null);
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
  const currentSession = sessions.find((session) => session.id === sessionId);
  const chatError = useMemo(() => error ? parseCompanionError(error.message) : null, [error]);
  const lastIsQuestion = messages.at(-1)?.role === 'user';
  const historyItems = sessions
    .filter((session) => session.id === sessionId || Number(session.message_count) > 0)
    .map((session) => ({
      id: session.id,
      title: session.title === 'New conversation' ? 'New chat' : session.title,
      preview: session.preview,
      message_count: session.message_count,
      when: relativeDate(session.updated_at, referenceTime)
    }));

  useEffect(() => setSessions(initialSessions), [initialSessions]);
  useEffect(() => {
    setReferenceTime(Date.now());
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: isWorking ? 'smooth' : 'instant', block: 'end' });
  }, [isWorking, messages, approvals]);

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
  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/companion/sessions', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not refresh chats');
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not refresh chats');
    }
  }, []);

  const wasWorking = useRef(false);
  useEffect(() => {
    if (isWorking) {
      wasWorking.current = true;
      return;
    }
    if (!wasWorking.current) return;
    wasWorking.current = false;
    void refreshApprovals();
    void refreshSessions();
    void refreshNeedsYou();
  }, [isWorking, refreshApprovals, refreshSessions, refreshNeedsYou]);

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
  const newChat = () => {
    setHistoryOpen(false);
    router.push('/companion?new=1');
  };
  const openChat = (id: string) => {
    setHistoryOpen(false);
    if (id !== sessionId) router.push(`/companion?chat=${encodeURIComponent(id)}`);
  };
  const renameChat = async (id: string, draft: string) => {
    const title = draft.trim();
    if (!title) return false;
    setSessionBusy(true);
    setNotice('');
    try {
      const response = await fetch(`/api/companion/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not rename the chat');
      await refreshSessions();
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not rename the chat');
      return false;
    } finally {
      setSessionBusy(false);
    }
  };
  const deleteChat = async (id: string) => {
    setSessionBusy(true);
    setNotice('');
    try {
      const response = await fetch(`/api/companion/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not delete the chat');
      if (id === sessionId) newChat();
      else await refreshSessions();
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not delete the chat');
      return false;
    } finally {
      setSessionBusy(false);
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
      window.setTimeout(() => setCopiedMessage(''), 1_500);
    } catch {
      setNotice('Could not copy this answer.');
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
    const proposals = activities.flatMap((activity) => {
      const approval = approvals.find((candidate) => candidate.id === activity.result?.approvalId);
      return approval ? [approval] : [];
    });
    return <div className="chat-turn is-assistant" key={message.id}>
      <span className="chat-avatar" aria-hidden="true"><Image src="/tagvico-icon.png" alt="" width={20} height={20} /></span>
      <Message from="assistant">
        <MessageContent>
          <ChatActivitySummary activities={activities}>
            {activities.map((activity, index) => <ToolActivityCard key={`${activity.toolName}-${index}`} activity={activity} />)}
          </ChatActivitySummary>
          {answers.map((answer, index) => answer
            ? <MessageResponse
              key={index}
              components={citationComponents}
              isAnimating={isWorking && isLast}
            >{linkCitations(answer, citations)}</MessageResponse>
            : null)}
          <SourceChips documents={citedDocuments(citations, seenActivities)} />
        </MessageContent>
        {answers.some(Boolean) ? <MessageActions className="companion-message-actions">
          <MessageAction label="Copy answer" tooltip="Copy answer" onClick={() => void copyMessage(message)}>
            {copiedMessage === message.id ? <Check /> : <Clipboard />}
          </MessageAction>
        </MessageActions> : null}
        {proposals.length ? <div className="chat-proposals">{proposals.map(renderApproval)}</div> : null}
      </Message>
    </div>;
  };

  // Proposals created before cards were tied to messages still need a place.
  const looseApprovals = approvals.filter((approval) => approval.status === 'pending' && !proposalIds.includes(approval.id));
  const visibleError = chatError
    || (notice ? { code: 'generic' as const, message: notice } : null)
    || (modelState === 'none' ? { code: 'no-provider' as const, message: NO_PROVIDER_MESSAGE } : null);

  return <div className="chat-shell">
    <header className="chat-head">
      <button
        type="button"
        className="chat-icon-btn chat-history-toggle"
        onClick={() => setHistoryOpen((value) => !value)}
        aria-label="Chat history"
        aria-expanded={historyOpen}
      ><History aria-hidden="true" /><span>History</span></button>
      <div className="chat-head-title">
        <strong>{currentSession && currentSession.title !== 'New conversation' ? currentSession.title : 'New chat'}</strong>
        <small>{isWorking ? 'Working…' : 'Answers cite your Paperless documents'}</small>
      </div>
      {needsCount ? <a className="chat-head-needs" href="/inbox">
        <Inbox aria-hidden="true" />{needsCount}<span> waiting</span>
      </a> : null}
      <button
        className="chat-icon-btn is-accent"
        type="button"
        onClick={newChat}
        disabled={sessionBusy || (!messages.length && !isWorking)}
        aria-label="New chat"
        title="New chat"
      ><MessageSquarePlus aria-hidden="true" /></button>
      {historyOpen ? <ChatHistoryPanel
        sessions={historyItems}
        activeId={sessionId}
        busy={sessionBusy}
        onClose={() => setHistoryOpen(false)}
        onOpen={openChat}
        onNew={newChat}
        onRename={renameChat}
        onDelete={deleteChat}
      /> : null}
    </header>

    <div className="chat-thread" aria-live="polite">
      <div className="chat-thread-inner">
        {!messages.length ? <ChatEmptyState
          displayName={displayName}
          needsCount={needsCount}
          suggestions={start?.suggestions ?? []}
          paperless={start?.paperless ?? 'ok'}
          canManageSettings={isOwner}
          onAsk={submitText}
          firstRun={showFirstRun ? {
            eyebrow: 'Your first five minutes',
            title: 'Start with one real question.',
            body: 'Your connections are ready. Ask a read-only question, open the cited Paperless source, then request an action. Tagvico will wait for approval before changing anything.'
          } : null}
        /> : messages.map(renderMessage)}
        {status === 'submitted' ? <div className="chat-thinking"><LoaderCircle className="is-spinning" aria-hidden="true" /><span>Thinking…</span></div> : null}
        {looseApprovals.map(renderApproval)}
        {messages.length ? <div ref={endRef} /> : null}
      </div>
    </div>

    <div className="chat-dock">
      {visibleError ? <ChatErrorNotice
        error={visibleError}
        canManageSettings={isOwner}
        onRetry={chatError && lastIsQuestion ? () => { clearError(); void regenerate(); } : undefined}
        onDismiss={() => { clearError(); setNotice(''); }}
      /> : null}
      <ChatComposer
        sessionId={sessionId}
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={() => void stop()}
        onModelState={setModelState}
        isWorking={isWorking}
        canSend={modelState !== 'none'}
      />
      <p className="chat-footnote"><ShieldCheck aria-hidden="true" />Tagvico answers from your Paperless archive and never changes anything without an approval.</p>
    </div>
  </div>;
}
