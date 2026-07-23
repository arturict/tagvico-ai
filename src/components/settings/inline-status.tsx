export function InlineStatus({
  kind,
  children
}: {
  kind: 'success' | 'error' | 'loading' | 'neutral';
  children: React.ReactNode;
}) {
  return <div className={`settings-status is-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span className="settings-status-dot" aria-hidden="true" />
    <span>{children}</span>
  </div>;
}
