import { Check, CircleAlert, CircleCheck, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { CompanionApprovalView } from '@root/contracts/companion';

/**
 * Inline proposal for one approval. The card presents the change and, once
 * decided, what happened; the caller owns the decision handlers and the role
 * check. A member who cannot approve sees the buttons disabled with the reason.
 */
export function ChatApprovalCard({
  approval,
  canApprove,
  approverNames,
  busy,
  error,
  onDecide
}: {
  approval: CompanionApprovalView;
  canApprove: boolean;
  approverNames: string[];
  busy: boolean;
  error?: string;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const { copy, outcome, status } = approval;
  const pending = status === 'pending';
  const label = pending
    ? 'Waiting for approval'
    : status === 'approved'
      ? 'Applying'
      : status === 'executed'
        ? 'Approved'
        : status === 'rejected'
          ? 'Rejected'
          : 'Failed';
  const reason = approverNames.length
    ? `Only owners and adults can approve. Ask ${approverNames.slice(0, 3).join(' or ')}.`
    : 'Only owners and adults can approve.';

  return <article
    className={`chat-approval is-${status}`}
    aria-label={`Proposal: ${copy.title}`}
    data-approval-id={approval.id}
    data-approval-status={status}
  >
    <header>
      <ShieldCheck aria-hidden="true" />
      <strong>Proposal</strong>
      <span>{label}</span>
    </header>
    <div className="chat-approval-body">
      <h3>{copy.title}</h3>
      <p>{copy.meta}</p>
      {copy.details.length ? <ul>
        {copy.details.map((detail) => <li key={detail}>{detail}</li>)}
      </ul> : null}
    </div>
    {outcome ? <div className={`chat-approval-outcome is-${outcome.tone}`} role="status">
      {outcome.tone === 'done'
        ? <CircleCheck aria-hidden="true" />
        : <CircleAlert aria-hidden="true" />}
      <p>
        <strong>{outcome.title}</strong>
        {outcome.detail ? <span> {outcome.detail}</span> : null}
      </p>
      {outcome.href ? <a href={outcome.href}>Open</a> : null}
    </div> : null}
    {status === 'approved' ? <div className="chat-approval-outcome" role="status">
      <LoaderCircle className="is-spinning" aria-hidden="true" />
      <p><strong>Approved.</strong><span> Applying the change.</span></p>
    </div> : null}
    {error ? <p className="chat-approval-error" role="alert">{error}</p> : null}
    {pending ? <footer>
      <p>
        {canApprove
          ? <><strong>Owners and adults can approve.</strong><span> Nothing changes until you decide.</span></>
          : <><strong>Waiting for an owner or adult.</strong><span> {reason}</span></>}
      </p>
      <div className="chat-approval-actions">
        <button
          type="button"
          className="chat-btn is-reject"
          disabled={busy || !canApprove}
          title={canApprove ? undefined : reason}
          onClick={() => onDecide('rejected')}
        ><X aria-hidden="true" />Reject</button>
        <button
          type="button"
          className="chat-btn is-approve"
          disabled={busy || !canApprove}
          title={canApprove ? undefined : reason}
          onClick={() => onDecide('approved')}
        >{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}Approve</button>
      </div>
    </footer> : null}
  </article>;
}
