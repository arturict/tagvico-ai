import Link from 'next/link';
import { Mascot } from '@/components/mascot/mascot';

export default function PersonNotFound() {
  return <div className="page-column">
    <div className="empty-state">
      <Mascot pose="searching" size={64} />
      <h1 className="page-title">No one here by that name</h1>
      <p>This person is not part of your household, or they were removed. Pick someone from the people row in the sidebar, or open Needs you.</p>
      <Link className="btn btn-secondary btn-32" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
