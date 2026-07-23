type WorkspaceLoadErrorProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function WorkspaceLoadError({
  title,
  message,
  onRetry,
  retrying = false
}: WorkspaceLoadErrorProps) {
  return <div className="empty workspace-load-error" role="alert">
    <h2>{title}</h2>
    <p>{message}</p>
    <button className="button" type="button" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Retrying…' : 'Try again'}
    </button>
  </div>;
}
