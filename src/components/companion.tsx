'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  FileSearch,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  X
} from 'lucide-react';
import {
  companionToolActivity,
  type CompanionToolActivity as CompanionToolActivityModel
} from '@root/contracts/companion';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse
} from '@/components/ai-elements/message';
import { CompanionModelPicker } from '@/components/companion-model-picker';

type Approval = { id: string; action_type: string; payload: Record<string, unknown>; status: string };
type SessionSummary = {
  id: string;
  title: string;
  preview?: string;
  message_count?: number;
  updated_at: string;
};

const suggestions = [
  {
    icon: FileSearch,
    title: 'Find something',
    prompt: 'Find my most recent insurance documents.'
  },
  {
    icon: CircleAlert,
    title: 'Check what matters',
    prompt: 'Which open actions or deadlines need my attention?'
  },
  {
    icon: ShieldCheck,
    title: 'Understand a document',
    prompt: 'Summarize document #42 and tell me what I need to do.'
  }
];

function relativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(hours, 'hour');
  const days = Math.round(hours / 24);
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day');
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
  const hasDetails = Boolean(query || documents.length || activity.result?.count !== undefined);

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
          <span className="companion-document-id">#{document.id}</span>
          <strong>{document.title}</strong>
          {document.created ? <small>{document.created}</small> : null}
        </li>)}
      </ul> : null}
      <small className="companion-tool-privacy">Only safe metadata is shown here. Document text stays inside the selected model runtime.</small>
    </div> : null}
  </details>;
}

function ToolActivity({ part }: { part: UIMessage['parts'][number] }) {
  if (!isToolUIPart(part)) return null;
  const activity = companionToolActivity(
    getToolName(part),
    part.state,
    'input' in part ? part.input : undefined,
    'output' in part ? part.output : undefined
  );
  return <ToolActivityCard activity={activity} />;
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
  initialMessages,
  initialApprovals,
  initialSessions,
  canApprove
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  initialApprovals: Approval[];
  initialSessions: SessionSummary[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [sessions, setSessions] = useState(initialSessions);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [decisionBusy, setDecisionBusy] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [editingSession, setEditingSession] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    return query
      ? sessions.filter((session) => `${session.title} ${session.preview || ''}`.toLowerCase().includes(query))
      : sessions;
  }, [sessionSearch, sessions]);

  useEffect(() => setSessions(initialSessions), [initialSessions]);
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
    }
  }, [status]);

  const submitText = (text: string) => {
    const normalized = text.trim();
    if (!normalized || status !== 'ready') return;
    setInput('');
    setNotice('');
    clearError();
    if (textareaRef.current) textareaRef.current.style.height = '';
    void sendMessage({ text: normalized });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitText(input);
  };
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
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
      router.push(`/companion?chat=${encodeURIComponent(body.sessionId)}`);
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not create a conversation');
    } finally {
      setSessionBusy(false);
    }
  };
  const renameChat = async (id: string) => {
    const title = titleDraft.trim();
    if (!title) return;
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
      setEditingSession('');
      await refreshSessions();
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not rename the conversation');
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
      setConfirmDelete('');
      if (id === sessionId) {
        setSessionSearch('');
        const replacement = sessions.find((session) => session.id !== id);
        if (replacement) router.push(`/companion?chat=${encodeURIComponent(replacement.id)}`);
        else await newChat();
      } else {
        await refreshSessions();
      }
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not delete the conversation');
    } finally {
      setSessionBusy(false);
    }
  };
  const copyMessage = async (message: UIMessage) => {
    const text = message.parts
      .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(message.id);
      window.setTimeout(() => setCopiedMessage(''), 1_500);
    } catch {
      setNotice('Could not copy this answer.');
    }
  };

  return <div className={`companion-studio${approvalsOpen && approvals.length ? ' has-approvals' : ''}`}>
    <aside className={`companion-sidebar panel${sessionsOpen ? ' is-sessions-open' : ''}`} aria-label="Conversations">
      <div className="companion-sidebar-head">
        <div>
          <button
            type="button"
            className="companion-product-mark"
            onClick={() => setSessionsOpen((value) => !value)}
            aria-label="Toggle conversations"
            aria-expanded={sessionsOpen}
          ><Menu aria-hidden="true" /></button>
          <span><strong>Ask Tagvico</strong><small>Your Paperless copilot</small></span>
        </div>
        <button className="companion-icon-button is-accent" type="button" onClick={() => void newChat()} disabled={sessionBusy} aria-label="New chat">
          <MessageSquarePlus aria-hidden="true" />
        </button>
      </div>
      <label className="companion-session-search">
        <Search aria-hidden="true" />
        <input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search chats" />
      </label>
      <nav>
        {filteredSessions.map((session) => <div className={`companion-session${session.id === sessionId ? ' is-active' : ''}`} key={session.id}>
          {editingSession === session.id ? <form className="companion-session-edit" onSubmit={(event) => { event.preventDefault(); void renameChat(session.id); }}>
            <input autoFocus maxLength={72} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} aria-label="Conversation title" />
            <button type="submit" disabled={sessionBusy || !titleDraft.trim()} aria-label="Save title"><Check /></button>
            <button type="button" onClick={() => setEditingSession('')} aria-label="Cancel rename"><X /></button>
          </form> : <>
            <button type="button" className="companion-session-open" onClick={() => router.push(`/companion?chat=${encodeURIComponent(session.id)}`)}>
              <strong>{session.title || 'New conversation'}</strong>
              <small>{session.preview || `${Number(session.message_count) || 0} messages`} · {relativeDate(session.updated_at)}</small>
            </button>
            <div className="companion-session-actions">
              <button type="button" onClick={() => { setEditingSession(session.id); setTitleDraft(session.title || 'New conversation'); }} aria-label={`Rename ${session.title || 'conversation'}`}><Pencil /></button>
              <button type="button" onClick={() => setConfirmDelete(session.id)} aria-label={`Delete ${session.title || 'conversation'}`}><Trash2 /></button>
            </div>
          </>}
          {confirmDelete === session.id ? <div className="companion-delete-confirm">
            <span>Delete this chat?</span>
            <button type="button" onClick={() => void deleteChat(session.id)} disabled={sessionBusy}>Delete</button>
            <button type="button" onClick={() => setConfirmDelete('')}>Cancel</button>
          </div> : null}
        </div>)}
        {!filteredSessions.length ? <p className="companion-no-sessions">No chats match your search.</p> : null}
      </nav>
      <div className="companion-sidebar-foot">
        <ShieldCheck aria-hidden="true" />
        <span><strong>Approval-first</strong><small>Research is read-only. Changes always wait for you.</small></span>
      </div>
    </aside>

    <section className="companion-chat panel">
      <header className="companion-chat-head">
        <div>
          <strong>{currentSession?.title || 'New conversation'}</strong>
          <small>{isWorking ? 'Working with your selected model…' : 'Ready to research your Paperless library'}</small>
        </div>
        {approvals.length ? <button type="button" className="companion-approval-toggle" onClick={() => setApprovalsOpen((value) => !value)}>
          <ShieldCheck aria-hidden="true" />
          {approvals.length} approval{approvals.length === 1 ? '' : 's'}
        </button> : <span className="companion-readonly-badge"><ShieldCheck aria-hidden="true" /> Read-only by default</span>}
      </header>

      <div className="companion-messages" aria-live="polite">
        {!messages.length ? <div className="companion-empty">
          <span className="companion-empty-mark"><FileSearch aria-hidden="true" /></span>
          <p className="eyebrow">Grounded in your documents</p>
          <h2>What do you want to know?</h2>
          <p>Ask naturally. Tagvico will show every Paperless search and document read it uses, then cite the matching document IDs.</p>
          <div className="companion-suggestions">
            {suggestions.map(({ icon: Icon, title, prompt }) => <button type="button" key={title} onClick={() => submitText(prompt)}>
              <Icon aria-hidden="true" />
              <span><strong>{title}</strong><small>{prompt}</small></span>
              <ChevronRight aria-hidden="true" />
            </button>)}
          </div>
        </div> : messages.map((message, messageIndex) => <Message key={message.id} from={message.role}>
          <MessageContent>
            {message.parts.map((part, index) => {
              if (part.type === 'text') return message.role === 'assistant'
                ? <MessageResponse key={index} isAnimating={isWorking && messageIndex === messages.length - 1}>{part.text}</MessageResponse>
                : <span key={index}>{part.text}</span>;
              if (isToolUIPart(part)) return <ToolActivity key={index} part={part} />;
              const activity = storedActivity(part);
              return activity ? <ToolActivityCard key={index} activity={activity} /> : null;
            })}
          </MessageContent>
          {message.role === 'assistant' && message.parts.some((part) => part.type === 'text') ? <MessageActions className="companion-message-actions">
            <MessageAction label="Copy answer" tooltip="Copy answer" onClick={() => void copyMessage(message)}>
              {copiedMessage === message.id ? <Check /> : <Clipboard />}
            </MessageAction>
            {messageIndex === messages.length - 1 && status === 'ready' ? <MessageAction label="Try again" tooltip="Try again" onClick={() => void regenerate()}>
              <RotateCcw />
            </MessageAction> : null}
          </MessageActions> : null}
        </Message>)}
        {status === 'submitted' ? <div className="companion-thinking"><LoaderCircle className="is-spinning" /><span>Planning the right research steps…</span></div> : null}
        <div ref={endRef} />
      </div>

      {(error || notice) ? <div className="companion-notice" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{error?.message || notice}</span>
        <button type="button" onClick={() => { clearError(); setNotice(''); }} aria-label="Dismiss error"><X /></button>
      </div> : null}
      <form className="companion-composer" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            event.currentTarget.style.height = '0';
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
          }}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask about a document, deadline, person, amount…"
          aria-label="Message"
          rows={1}
        />
        <div className="companion-composer-bar">
          <CompanionModelPicker sessionId={sessionId} />
          <span className="companion-composer-hint">Enter to send · Shift+Enter for a new line</span>
          {isWorking ? <button className="companion-send is-stop" type="button" onClick={() => void stop()} aria-label="Stop response">
            <Square aria-hidden="true" />
          </button> : <button className="companion-send" type="submit" disabled={!input.trim()} aria-label="Send message">
            <Send aria-hidden="true" />
          </button>}
        </div>
      </form>
    </section>

    {approvalsOpen && approvals.length ? <aside className="companion-approvals panel" aria-label="Pending approvals">
      <header>
        <div><span className="eyebrow">Nothing changes silently</span><h2>Pending approvals</h2></div>
        <button className="companion-icon-button" type="button" onClick={() => setApprovalsOpen(false)} aria-label="Close approvals"><X /></button>
      </header>
      <p className="muted">Review the exact proposal before Tagvico writes anything.</p>
      <div>
        {approvals.map((approval) => <article className="approval" key={approval.id}>
          <span className="pill suggested">proposal</span>
          <h3>{approval.action_type === 'action.create' ? String(approval.payload.title || 'New action') : 'Update an action'}</h3>
          <p>{approval.payload.paperlessDocumentId ? `Document #${approval.payload.paperlessDocumentId}` : 'Review details before approving.'}</p>
          {canApprove ? <div className="approval-actions">
            <button type="button" className="button primary" disabled={!!decisionBusy} onClick={() => void decide(approval.id, 'approved')}>Approve</button>
            <button type="button" className="button danger" disabled={!!decisionBusy} onClick={() => void decide(approval.id, 'rejected')}>Reject</button>
          </div> : <p className="muted">Your role cannot decide this proposal.</p>}
        </article>)}
      </div>
    </aside> : null}
  </div>;
}
