import Link from 'next/link';

export default function PersonNotFound() {
  return <div className="page-column">
    <div className="empty-state">
      <h1 className="page-title">No one here by that name</h1>
      <p>This person is not part of your household, or they were removed.</p>
      <Link className="btn btn-secondary btn-32" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
