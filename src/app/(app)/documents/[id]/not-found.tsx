import Link from 'next/link';

export default function DocumentNotFound() {
  return <div className="page-column doc-detail">
    <section className="empty-state" role="status">
      <h1 className="pg-empty-title">This document is not available</h1>
      <p>It may have been deleted from Paperless, or your Paperless account cannot see it.</p>
      <Link className="btn btn-secondary btn-32" href="/documents">All documents</Link>
    </section>
  </div>;
}
