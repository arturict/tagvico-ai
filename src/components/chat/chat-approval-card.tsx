import { Check, ShieldCheck, X } from 'lucide-react';

export type ChatApprovalCopy = { title: string; meta: string; details: string[] };

/**
 * Inline proposal for one pending approval. The card only presents the
 * change; the caller owns the decision handlers and the role check.
 */
export function ChatApprovalCard({
  copy,
  canApprove,
  busy,
  onDecide
}: {
  copy: ChatApprovalCopy;
  canApprove: boolean;
  busy: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  return <article className="chat-approval">
    <header>
      <ShieldCheck aria-hidden="true" />
      <strong>Proposal</strong>
      <span>Waiting for approval</span>
    </header>
    <div className="chat-approval-body">
      <h3>{copy.title}</h3>
      <p>{copy.meta}</p>
      {copy.details.length ? <ul>
        {copy.details.map((detail) => <li key={detail}>{detail}</li>)}
      </ul> : null}
    </div>
    <footer>
      <p>
        <strong>Owners and adults can approve.</strong>
        <span>{canApprove
          ? ' Nothing changes until you decide.'
          : ' Your role can see this proposal but cannot decide it.'}</span>
      </p>
      {canApprove ? <div className="chat-approval-actions">
        <button type="button" className="chat-btn is-reject" disabled={busy} onClick={() => onDecide('rejected')}>
          <X aria-hidden="true" />Reject
        </button>
        <button type="button" className="chat-btn is-approve" disabled={busy} onClick={() => onDecide('approved')}>
          <Check aria-hidden="true" />Approve
        </button>
      </div> : null}
    </footer>
  </article>;
}
