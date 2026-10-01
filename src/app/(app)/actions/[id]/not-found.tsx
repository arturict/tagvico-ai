import Link from 'next/link';

export default function ActionNotFound() {
  return <div className="page-column">
    <div className="empty-state">
      <h1 className="page-title">This action does not exist</h1>
      <p>It may belong to another household or was removed.</p>
      <Link className="btn btn-secondary btn-32" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
