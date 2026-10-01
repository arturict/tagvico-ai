/*
 * Loading placeholder: grey rows of the real row height under a title bar.
 * `dashboard` draws label/value rows (Overview), `table` draws list rows.
 * `embedded` drops the page column and title for use inside a page that
 * already renders its own header.
 */
export function WorkspacePageSkeleton({
  kind = 'table',
  embedded = false
}: {
  kind?: 'dashboard' | 'table';
  embedded?: boolean;
}) {
  const rows = Array.from({ length: kind === 'dashboard' ? 6 : 8 }, (_, index) => index);
  const body = <div className="pg-skeleton-rows">
    {rows.map((index) => kind === 'dashboard'
      ? <div className="pg-skeleton-row is-pair" key={index}>
        <span className="pg-skeleton-bar is-label" />
        <span className="pg-skeleton-bar is-value" />
      </div>
      : <div className="pg-skeleton-row" key={index}>
        <span className="pg-skeleton-stack">
          <span className="pg-skeleton-bar is-title" />
          <span className="pg-skeleton-bar is-meta" />
        </span>
        <span className="pg-skeleton-bar is-value" />
      </div>)}
  </div>;

  if (embedded) return <div className="pg-skeleton" aria-busy="true" aria-label="Loading">{body}</div>;

  return <div className="page-column pg-skeleton" aria-busy="true" aria-label="Loading page">
    <div className="pg-skeleton-head"><span className="pg-skeleton-bar is-page-title" /></div>
    {body}
  </div>;
}
