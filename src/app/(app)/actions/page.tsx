import Link from 'next/link';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { CreateActionForm } from '@/components/create-action-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Actions' };

export default async function ActionsPage() {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const cases = actionCenter.listCases(workspace.householdId);
  const stats = actionCenter.dashboard(workspace.householdId) as Record<string, number | null>;
  const members = actionCenter.listMembers(workspace.householdId) as Array<Record<string, unknown>>;
  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">Household overview</p><h1>Action center</h1><p className="lede">Every letter becomes a decision, a deadline, or a completed task—not another forgotten PDF.</p></div></header>
    <section className="stats" aria-label="Action statistics">
      <div className="stat"><strong>{stats.active || 0}</strong><span>Active</span></div>
      <div className="stat"><strong>{stats.suggestions || 0}</strong><span>AI suggestions</span></div>
      <div className="stat"><strong>{stats.overdue || 0}</strong><span>Overdue</span></div>
      <div className="stat"><strong>{stats.done || 0}</strong><span>Completed</span></div>
    </section>
    {workspace.role === 'viewer' ? <p className="muted">You have read-only household access.</p> : <CreateActionForm members={members.map((member) => ({ id: String(member.id), name: String(member.display_name) }))} />}
    <div className="toolbar"><span className="muted">{cases.length} cases · one case may contain multiple steps</span></div>
    <section className="case-list">
      {cases.map((item: Record<string, unknown>) => <Link className="case" key={String(item.id)} href={`/actions/${item.id}`}>
        <div><div className="case-title"><span className={`pill ${item.status}`}>{String(item.status)}</span><span>{String(item.title)}</span></div>
          <div className="case-meta"><span>Paperless #{String(item.paperlessDocumentId)}</span><span>{Number(item.completed_step_count)}/{Number(item.step_count)} steps</span>{item.assignee_name ? <span>{String(item.assignee_name)}</span> : null}{item.dueAt ? <span>Due {new Date(String(item.dueAt)).toLocaleDateString()}</span> : null}</div></div>
        <span className={`pill ${item.priority}`}>{String(item.priority)}</span>
      </Link>)}
      {!cases.length && <div className="empty"><h2>No actions yet</h2><p>Create one above or ask Tagvico to inspect a document.</p></div>}
    </section>
  </div>;
}
