import Link from 'next/link';

export default function PersonNotFound() {
  return <div className="inbox">
    <div className="inbox-empty">
      <h2>No one here by that name</h2>
      <p>This person is not part of your household, or they were removed. Pick someone from the People list in the sidebar.</p>
      <Link className="inbox-btn is-primary" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
