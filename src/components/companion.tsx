'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage
} from 'ai';
import { useChat } from '@ai-sdk/react';
import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  companionToolActivity,
  type CompanionToolActivity as CompanionToolActivityModel
} from '@root/contracts/companion';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { CompanionModelPicker } from '@/components/companion-model-picker';

type Approval = { id: string; action_type: string; payload: Record<string, unknown>; status: string };
const welcome: UIMessage = { id: 'welcome', role: 'assistant', parts: [{ type: 'text', text: 'What should we take care of? I can find documents, explain obligations, and prepare actions for your approval.' }] };

function ToolActivityCard({ activity }: { activity: CompanionToolActivityModel }) {
  const Icon = activity.status === 'running'
    ? LoaderCircle
    : activity.status === 'succeeded'
      ? CheckCircle2
      : activity.status === 'failed'
        ? CircleAlert
        : ShieldCheck;
  return <div className={`companion-tool is-${activity.status}`} role="status">
    <Icon className={activity.status === 'running' ? 'is-spinning' : undefined} aria-hidden="true" />
    <span>
      <strong>{activity.label}</strong>
      <small>{activity.detail}</small>
    </span>
    <span className="companion-tool-status">
      {activity.status === 'running'
        ? 'Running'
        : activity.status === 'succeeded'
          ? 'Completed'
          : activity.status === 'failed'
            ? 'Failed'
            : 'Waiting'}
    </span>
  </div>;
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
  return candidate as unknown as CompanionToolActivityModel;
}

export function Companion({ sessionId, initialMessages, initialApprovals, canApprove }: { sessionId: string; initialMessages: UIMessage[]; initialApprovals: Approval[]; canApprove: boolean }) {
  const [approvals, setApprovals] = useState(initialApprovals); const [input, setInput] = useState(''); const [decisionError, setDecisionError] = useState(''); const [decisionBusy, setDecisionBusy] = useState(''); const endRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({ id: sessionId, messages: initialMessages.length ? initialMessages : [welcome], transport: new DefaultChatTransport({ api: '/api/companion', body: { sessionId } }) });
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  const refreshApprovals = async () => { try { const response = await fetch('/api/approvals'); if (!response.ok) throw new Error('Could not refresh approvals'); setApprovals((await response.json()).approvals); } catch (cause) { setDecisionError(cause instanceof Error ? cause.message : 'Could not refresh approvals'); } };
  useEffect(() => { if (status === 'ready') void refreshApprovals(); }, [status]);
  const submit = (event: FormEvent) => { event.preventDefault(); const text = input.trim(); if (!text || status !== 'ready') return; setInput(''); void sendMessage({ text }); };
  const decide = async (id: string, decision: 'approved' | 'rejected') => { setDecisionError(''); setDecisionBusy(id); try { const response = await fetch(`/api/approvals/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Could not decide approval'); await refreshApprovals(); } catch (cause) { setDecisionError(cause instanceof Error ? cause.message : 'Could not decide approval'); } finally { setDecisionBusy(''); } };
  return <div className="split"><section className="panel chat"><div className="messages" aria-live="polite">{messages.map((message) => <Message key={message.id} from={message.role}><MessageContent>{message.parts.map((part, index) => {
    if (part.type === 'text') return message.role === 'assistant' ? <MessageResponse key={index}>{part.text}</MessageResponse> : <span key={index}>{part.text}</span>;
    if (isToolUIPart(part)) return <ToolActivity key={index} part={part} />;
    const activity = storedActivity(part);
    return activity ? <ToolActivityCard key={index} activity={activity} /> : null;
  })}</MessageContent></Message>)}<div ref={endRef} /></div>
    <form className="composer companion-composer" onSubmit={submit}>
      <CompanionModelPicker sessionId={sessionId} />
      <div className="companion-composer-main">
        <textarea
          className="field"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask about a document or deadline…"
          aria-label="Message"
        />
        <button className="button primary" disabled={status !== 'ready' || !input.trim()}>
          {status === 'streaming' || status === 'submitted' ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </form>{(error || decisionError) && <div className="error" style={{ padding: '0 14px 12px' }}>{error?.message || decisionError}</div>}</section>
    <aside className="approvals"><h2>Needs approval</h2><p className="muted">AI can prepare. An owner or adult executes.</p>{approvals.map((approval) => <article className="approval" key={approval.id}><span className="pill suggested">proposal</span><h3>{approval.action_type === 'action.create' ? String(approval.payload.title || 'New action') : approval.action_type}</h3><p>{approval.action_type} · {approval.payload.paperlessDocumentId ? `Document #${approval.payload.paperlessDocumentId}` : 'Review details before approving.'}</p>{canApprove ? <div className="approval-actions"><button type="button" className="button primary" disabled={!!decisionBusy} onClick={() => decide(approval.id, 'approved')}>Approve</button><button type="button" className="button danger" disabled={!!decisionBusy} onClick={() => decide(approval.id, 'rejected')}>Reject</button></div> : <p className="muted">Your role cannot decide this proposal.</p>}</article>)}{!approvals.length && <div className="empty" style={{ padding: 24 }}>Nothing pending</div>}</aside>
  </div>;
}
