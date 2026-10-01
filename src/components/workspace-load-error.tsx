type WorkspaceLoadErrorProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

/* What failed, the reason, and one retry button; sits where the content would have loaded. */
export function WorkspaceLoadError({
  title,
  message,
  onRetry,
  retrying = false
}: WorkspaceLoadErrorProps) {
  return <div className="empty-state pg-load-error" role="alert">
    <p className="pg-empty-title">{title}</p>
    <p>{message}</p>
    <button className="btn btn-secondary btn-32" type="button" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Retrying…' : 'Try again'}
    </button>
  </div>;
}
