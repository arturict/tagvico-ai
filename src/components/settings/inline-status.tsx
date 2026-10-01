export function InlineStatus({
  kind,
  children
}: {
  kind: 'success' | 'error' | 'loading' | 'neutral';
  children: React.ReactNode;
}) {
  return <div className={`set-status is-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span className={kind === 'loading' ? 'shimmer' : undefined}>{children}</span>
  </div>;
}
