import Link from 'next/link';

export default function ActionNotFound() {
  return <div className="inbox">
    <div className="inbox-empty">
      <h2>This action does not exist</h2>
      <p>It may belong to another household or was removed. Open Needs you to see what is current.</p>
      <Link className="inbox-btn is-primary" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
