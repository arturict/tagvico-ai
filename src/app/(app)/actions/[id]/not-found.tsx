import Link from 'next/link';
import { Mascot } from '@/components/mascot/mascot';

export default function ActionNotFound() {
  return <div className="page-column">
    <div className="empty-state">
      <Mascot pose="searching" size={64} />
      <h1 className="page-title">This action does not exist</h1>
      <p>It may belong to another household or was removed. Needs you lists everything that is open.</p>
      <Link className="btn btn-secondary btn-32" href="/inbox">Open Needs you</Link>
    </div>
  </div>;
}
