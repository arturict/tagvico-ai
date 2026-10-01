import { Mascot } from '@/components/mascot/mascot';

type WorkspaceLoadErrorProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  /** The mascot with an oops face; for errors that replace a whole page, not one section among several. */
  mascot?: boolean;
};

/* What failed, the reason, and one retry button; sits where the content would have loaded. */
export function WorkspaceLoadError({
  title,
  message,
  onRetry,
  retrying = false,
  mascot = false
}: WorkspaceLoadErrorProps) {
  return <div className="empty-state pg-load-error" role="alert">
    {mascot ? <Mascot pose="oops" size={48} /> : null}
    <p className="pg-empty-title">{title}</p>
    <p>{message}</p>
    <button className="btn btn-secondary btn-32" type="button" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Retrying…' : 'Try again'}
    </button>
  </div>;
}
