import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import type { CompanionApprovalView } from '@root/contracts/companion';

/**
 * Inline proposal for one approval. While it waits, the card shows the change
 * and two buttons; once decided it collapses to a single line saying what
 * happened. The caller owns the decision handlers and the role check. A member
 * who cannot approve sees the buttons disabled and the reason next to them.
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
  const reason = approverNames.length
    ? `Only owners and adults can approve. Ask ${approverNames.slice(0, 3).join(' or ')}.`
    : 'Only owners and adults can approve.';

  return <article
    className={`chat-approval is-${status}${pending ? '' : ' is-decided'}`}
    aria-label={`Proposal: ${copy.title}`}
    data-approval-id={approval.id}
    data-approval-status={status}
  >
    {pending ? <>
      <div className="chat-approval-body">
        <h3>{copy.title}</h3>
        <p>{copy.meta}</p>
        {copy.details.length ? <ul>
          {copy.details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul> : null}
      </div>
      {error ? <p className="chat-approval-error" role="alert">{error}</p> : null}
      <footer>
        {canApprove ? null : <p>{reason}</p>}
        <div className="chat-approval-actions">
          <button
            type="button"
            className="btn btn-secondary btn-32 is-reject"
            disabled={busy || !canApprove}
            title={canApprove ? undefined : reason}
            onClick={() => onDecide('rejected')}
          >Reject</button>
          <button
            type="button"
            className="btn btn-primary btn-32 is-approve"
            disabled={busy || !canApprove}
            title={canApprove ? undefined : reason}
            onClick={() => onDecide('approved')}
          >{busy ? <LoaderCircle className="chat-spin" aria-hidden="true" /> : null}Approve</button>
        </div>
      </footer>
    </> : null}
    {outcome ? <p className={`chat-approval-outcome is-${outcome.tone}`} role="status">
      {outcome.tone === 'done'
        ? <CircleCheck aria-hidden="true" />
        : <CircleAlert aria-hidden="true" />}
      <span>
        <strong>{outcome.title}</strong>
        {outcome.detail ? <> {outcome.detail}</> : null}
      </span>
      {outcome.href ? <a href={outcome.href}>Open</a> : null}
    </p> : null}
    {status === 'approved' ? <p className="chat-approval-outcome" role="status">
      <LoaderCircle className="chat-spin" aria-hidden="true" />
      <span><strong>Approved.</strong> Applying the change.</span>
    </p> : null}
    {!pending && error ? <p className="chat-approval-error" role="alert">{error}</p> : null}
  </article>;
}
