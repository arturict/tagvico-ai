import Link from 'next/link';
import { Mascot } from '@/components/mascot/mascot';

export default function DocumentNotFound() {
  return <div className="page-column doc-detail">
    <section className="empty-state" role="status">
      <Mascot pose="searching" size={64} />
      <h1 className="pg-empty-title">This document is not available</h1>
      <p>It may have been deleted from Paperless, or your Paperless account cannot see it. Check the number in the address, or pick the document from the list.</p>
      <Link className="btn btn-secondary btn-32" href="/documents">All documents</Link>
    </section>
  </div>;
}
