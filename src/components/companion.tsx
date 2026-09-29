'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import {
  companionToolActivity,
  sanitizeCompanionText,
  type CompanionToolActivity as CompanionToolActivityModel
} from '@root/contracts/companion';
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
import { ChatHistoryPanel } from '@/components/chat/chat-history-panel';
import {
  SourceChips,
  citationComponents,
  citedDocumentIds,
  citedDocuments,
  linkCitations
} from '@/components/chat/citations';

type Approval = {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
  session_id?: string | null;
};
type SessionSummary = {
  id: string;
  title: string;
  preview?: string;
  message_count?: number;
  updated_at: string;
};

function approvalValue(value: unknown) {
  if (value === null) return 'None';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unable to display';
  }
}

function approvalCopy(approval: Approval) {
  const payload = approval.payload || {};
  const patch = payload.patch && typeof payload.patch === 'object'
    ? payload.patch as Record<string, unknown>
    : {};
  if (approval.action_type === 'paperless.tag.create') {
    return {
      title: `Create tag “${String(payload.name || 'New tag')}”`,
      meta: 'Paperless tag',
      details: [String(payload.reason || '')].filter(Boolean)
    };
  }
  if (approval.action_type === 'paperless.tag.update') {
    return {
      title: `Update tag “${String(payload.tagName || `#${payload.tagId}`)}”`,
      meta: `${Number(payload.documentCount) || 0} linked documents`,
      details: [
        ...Object.entries(patch).map(([key, value]) => `${key}: ${String(value)}`),
        String(payload.reason || '')
      ].filter(Boolean)
    };
  }
  if (approval.action_type === 'paperless.tag.delete') {
    return {
      title: `Delete tag “${String(payload.tagName || `#${payload.tagId}`)}”`,
      meta: `${Number(payload.documentCount) || 0} linked documents`,
      details: [String(payload.reason || '')].filter(Boolean)
    };
  }
  if (approval.action_type === 'paperless.patch') {
    return {
      title: `Update ${String(payload.documentTitle || `document #${payload.documentId}`)}`,
      meta: `Document #${String(payload.documentId || '')}`,
      details: [
        ...Object.entries(patch).map(([key, value]) => `${key}: ${approvalValue(value)}`),
        String(payload.reason || '')
      ].filter(Boolean)
    };
  }
  if (approval.action_type === 'action.create') {
    return {
      title: String(payload.title || 'New action'),
      meta: payload.paperlessDocumentId ? `Document #${payload.paperlessDocumentId}` : 'Action',
      details: [String(payload.summary || '')].filter(Boolean)
    };
  }
  return {
    title: 'Update an action',
    meta: 'Action',
    details: Object.keys(patch).length ? [`Fields: ${Object.keys(patch).join(', ')}`] : []
  };
}

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
    'output' in part ? part.output : undefined
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
  renderedAt,
  showFirstRun = false
}: {
  sessionId: string;
  displayName: string;
  initialMessages: UIMessage[];
  initialApprovals: Approval[];
  initialSessions: SessionSummary[];
  canApprove: boolean;
  renderedAt: number;
  showFirstRun?: boolean;
}) {
  const router = useRouter();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [sessions, setSessions] = useState(initialSessions);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [decisionBusy, setDecisionBusy] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState('');
  const [needsYou, setNeedsYou] = useState<number | null>(null);
  const [referenceTime, setReferenceTime] = useState(renderedAt);
  const endRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    clearError
  } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/companion', body: { sessionId } })
  });
  const isWorking = status === 'streaming' || status === 'submitted';
  const currentSession = sessions.find((session) => session.id === sessionId);
  const sessionApprovals = useMemo(
    () => approvals.filter((approval) => approval.session_id === sessionId),
    [approvals, sessionId]
  );
  const needsCount = needsYou ?? approvals.length;
  const historyItems = sessions.map((session) => ({
    id: session.id,
    title: session.title,
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
  }, [isWorking, messages]);

  const refreshApprovals = async () => {
    try {
      const response = await fetch('/api/approvals', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not refresh approvals');
      setApprovals(Array.isArray(body.approvals) ? body.approvals : []);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not refresh approvals');
    }
  };
  // The household summary is optional: without it the pending approvals
  // this page already knows about are the count.
  const refreshNeedsYou = async () => {
    try {
      const response = await fetch('/api/navigation/household', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => null) as { needsYouCount?: unknown } | null;
      const count = Number(body?.needsYouCount);
      setNeedsYou(Number.isSafeInteger(count) && count >= 0 ? count : null);
    } catch {
      setNeedsYou(null);
    }
  };
  const refreshSessions = async () => {
    try {
      const response = await fetch('/api/companion/sessions', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not refresh conversations');
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not refresh conversations');
    }
  };
  useEffect(() => {
    if (status === 'ready') {
      void refreshApprovals();
      void refreshSessions();
      void refreshNeedsYou();
    }
  }, [status]);

  const submitText = (text: string) => {
    const normalized = text.trim();
    if (!normalized || status !== 'ready') return;
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
    setDecisionBusy(id);
    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not decide approval');
      await refreshApprovals();
      void refreshNeedsYou();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not decide approval');
    } finally {
      setDecisionBusy('');
    }
  };
  const newChat = async () => {
    setSessionBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/companion/sessions', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create a conversation');
      setHistoryOpen(false);
      router.push(`/companion?chat=${encodeURIComponent(body.sessionId)}`);
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not create a conversation');
    } finally {
      setSessionBusy(false);
    }
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
      if (!response.ok) throw new Error(body.error || 'Could not rename the conversation');
      await refreshSessions();
      router.refresh();
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not rename the conversation');
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
      if (!response.ok) throw new Error(body.error || 'Could not delete the conversation');
      if (id === sessionId) {
        const replacement = sessions.find((session) => session.id !== id);
        if (replacement) router.push(`/companion?chat=${encodeURIComponent(replacement.id)}`);
        else await newChat();
      } else {
        await refreshSessions();
      }
      router.refresh();
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not delete the conversation');
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

  const renderMessage = (message: UIMessage, messageIndex: number) => {
    const texts = message.parts.flatMap((part) => part.type === 'text' ? [part.text] : []);
    if (message.role === 'user') {
      return <div className="chat-turn is-user" key={message.id}>
        <Message from="user">
          <MessageContent>{texts.map((text, index) => <span key={index}>{text}</span>)}</MessageContent>
        </Message>
      </div>;
    }
    const activities = message.parts
      .map(activityFromPart)
      .filter((activity): activity is CompanionToolActivityModel => Boolean(activity));
    const answers = texts.map((text) => sanitizeCompanionText(text));
    if (!activities.length && !answers.some(Boolean)) return null;
    const isLast = messageIndex === messages.length - 1;
    const citations = citedDocumentIds(answers.join('\n\n'));
    return <div className="chat-turn is-assistant" key={message.id}>
      <span className="chat-avatar" aria-hidden="true"><Sparkles /></span>
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
          <SourceChips documents={citedDocuments(citations, activities)} />
        </MessageContent>
        {answers.some(Boolean) ? <MessageActions className="companion-message-actions">
          <MessageAction label="Copy answer" tooltip="Copy answer" onClick={() => void copyMessage(message)}>
            {copiedMessage === message.id ? <Check /> : <Clipboard />}
          </MessageAction>
          {isLast && status === 'ready' ? <MessageAction label="Try again" tooltip="Try again" onClick={() => void regenerate()}>
            <RotateCcw />
          </MessageAction> : null}
        </MessageActions> : null}
      </Message>
    </div>;
  };

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
        <strong>{currentSession?.title || 'New chat'}</strong>
        <small>{isWorking ? 'Working with your selected model…' : 'Answers come from your documents'}</small>
      </div>
      {needsCount ? <a className="chat-head-needs" href="/inbox">
        <Inbox aria-hidden="true" />{needsCount}<span> waiting</span>
      </a> : null}
      <button
        className="chat-icon-btn is-accent"
        type="button"
        onClick={() => void newChat()}
        disabled={sessionBusy}
        aria-label="New chat"
      ><MessageSquarePlus aria-hidden="true" /></button>
      {historyOpen ? <ChatHistoryPanel
        sessions={historyItems}
        activeId={sessionId}
        busy={sessionBusy}
        onClose={() => setHistoryOpen(false)}
        onOpen={openChat}
        onNew={() => void newChat()}
        onRename={renameChat}
        onDelete={deleteChat}
      /> : null}
    </header>

    <div className="chat-thread" aria-live="polite">
      <div className="chat-thread-inner">
        {!messages.length ? <ChatEmptyState
          displayName={displayName}
          needsCount={needsCount}
          onAsk={submitText}
          firstRun={showFirstRun ? {
            eyebrow: 'Your first five minutes',
            title: 'Start with one real question.',
            body: 'Your connections are ready. Ask a read-only question, open the cited Paperless source, then request an action. Tagvico will wait for approval before changing anything.'
          } : null}
        /> : messages.map(renderMessage)}
        {status === 'submitted' ? <div className="chat-thinking"><LoaderCircle className="is-spinning" aria-hidden="true" /><span>Planning the right research steps…</span></div> : null}
        {sessionApprovals.map((approval) => <ChatApprovalCard
          key={approval.id}
          copy={approvalCopy(approval)}
          canApprove={canApprove}
          busy={!!decisionBusy}
          onDecide={(decision) => void decide(approval.id, decision)}
        />)}
        {messages.length ? <div ref={endRef} /> : null}
      </div>
    </div>

    <div className="chat-dock">
      {(error || notice) ? <div className="chat-notice" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{error?.message || notice}</span>
        <button type="button" onClick={() => { clearError(); setNotice(''); }} aria-label="Dismiss error"><X /></button>
      </div> : null}
      <ChatComposer
        sessionId={sessionId}
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={() => void stop()}
        isWorking={isWorking}
      />
      <p className="chat-footnote"><ShieldCheck aria-hidden="true" />Tagvico answers from your Paperless archive and never changes anything without an approval.</p>
    </div>
  </div>;
}
