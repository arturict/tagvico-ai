import Link from 'next/link';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { ActionsHeader } from '@/components/inbox/actions-header';
import { shortDate } from '@/components/inbox/dates';
import { Mascot } from '@/components/mascot/mascot';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Actions' };

const STATUS_TEXT: Record<string, string> = { suggested: 'Suggested', waiting: 'Waiting', done: 'Done', dismissed: 'Dismissed' };

export default async function ActionsPage() {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const cases = actionCenter.listCases(workspace.householdId) as Array<Record<string, unknown>>;
  const members = actionCenter.listMembers(workspace.householdId) as Array<Record<string, unknown>>;
  return <div className="page-column inbox">
    <ActionsHeader canCreate={workspace.role !== 'viewer'} members={members.map((member) => ({ id: String(member.id), name: String(member.display_name) }))} />
    {workspace.role === 'viewer' ? <p className="meta">You have read-only household access.</p> : null}
    {cases.length ? <ul className="list">
      {cases.map((item) => {
        const status = STATUS_TEXT[String(item.status)];
        const steps = Number(item.step_count);
        return <li key={String(item.id)} className="list-row work-row is-interactive">
          <div className="list-row-main">
            <Link className="list-row-title work-title" href={`/actions/${item.id}`}>{String(item.title)}</Link>
            <p className="list-row-meta meta-parts">
              {item.priority === 'urgent' || item.priority === 'high' ? <span>{item.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : null}
              <span>Document #{String(item.paperlessDocumentId)}</span>
              {steps ? <span>{Number(item.completed_step_count)}/{steps} steps</span> : null}
              {item.assignee_name ? <span>{String(item.assignee_name)}</span> : null}
            </p>
          </div>
          <div className="list-row-trailing work-due">
            {[status, item.dueAt ? `Due ${shortDate(String(item.dueAt))}` : null].filter(Boolean).join(' · ')}
          </div>
        </li>;
      })}
    </ul> : <div className="empty-state"><Mascot pose="sleeping" size={64} /><p>No actions yet. Create one or ask Tagvico to look at a document.</p></div>}
  </div>;
}
