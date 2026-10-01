import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function DocumentNotFound() {
  return <div className="page document-source-page">
    <section className="empty" role="status">
      <h2>This document is not available</h2>
      <p>It may have been deleted from Paperless, or your Paperless account cannot see it.</p>
      <div className="workspace-actions">
        <Link className="button primary" href="/documents"><ArrowLeft aria-hidden="true" /> All documents</Link>
        <Link className="button" href="/companion?new=1">Ask in Chat</Link>
      </div>
    </section>
  </div>;
}
