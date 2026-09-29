import Link from 'next/link';

export interface WorkloadCase {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  paperlessDocumentId: number;
}

export interface WorkloadApproval {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

const DAY_MS = 86_400_000;

function dayNumber(value: string) {
  return Math.floor(Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

function dueLabel(dueAt: string, today: number) {
  const days = dayNumber(dueAt) - today;
  const date = new Date(`${dueAt.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (days < 0) return `${date} · ${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  return `${date} · in ${days} days`;
}

export function groupCases(cases: WorkloadCase[], now = new Date()) {
  const today = Math.floor(now.getTime() / DAY_MS);
  const groups = { overdue: [] as WorkloadCase[], week: [] as WorkloadCase[], later: [] as WorkloadCase[] };
  for (const item of cases) {
    if (!item.dueAt) groups.later.push(item);
    else if (dayNumber(item.dueAt) < today) groups.overdue.push(item);
    else if (dayNumber(item.dueAt) <= today + 7) groups.week.push(item);
    else groups.later.push(item);
  }
  const byDue = (a: WorkloadCase, b: WorkloadCase) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999');
  groups.overdue.sort(byDue); groups.week.sort(byDue); groups.later.sort(byDue);
  return { groups, today };
}

export function MemberWorkload({ cases, approvals, name }: { cases: WorkloadCase[]; approvals: WorkloadApproval[]; name: string }) {
  const { groups, today } = groupCases(cases);
  const sections = [
    { key: 'overdue', title: 'Overdue', items: groups.overdue },
    { key: 'week', title: 'This week', items: groups.week },
    { key: 'later', title: 'Later', items: groups.later }
  ] as const;
  return <>
    {cases.length === 0
      ? <section className="people-group"><div className="empty"><h2>Nothing open</h2><p>{name} has no open action cases.</p></div></section>
      : sections.filter((section) => section.items.length > 0).map((section) => <section className="people-group" key={section.key} aria-labelledby={`people-${section.key}`}>
        <h2 id={`people-${section.key}`} className={`people-group-title is-${section.key}`}>{section.title}<span>{section.items.length}</span></h2>
        <div className="case-list">
          {section.items.map((item) => <Link className="case" key={item.id} href={`/actions/${item.id}`}>
            <div>
              <div className="case-title"><span className={`pill ${item.status}`}>{item.status}</span><span>{item.title}</span></div>
              <div className="case-meta">
                <span>Paperless #{item.paperlessDocumentId}</span>
                <span className={section.key === 'overdue' ? 'people-due-late' : undefined}>{item.dueAt ? dueLabel(item.dueAt, today) : 'No due date'}</span>
              </div>
            </div>
            <span className={`pill ${item.priority}`}>{item.priority}</span>
          </Link>)}
        </div>
      </section>)}
    <section className="people-group" aria-labelledby="people-approvals">
      <h2 id="people-approvals" className="people-group-title">Requested approvals<span>{approvals.length}</span></h2>
      {approvals.length === 0
        ? <div className="people-card"><p>{name} has not requested any changes yet.</p></div>
        : <ul className="people-approvals">
          {approvals.map((approval) => <li key={approval.id}>
            <span>{approval.title}</span>
            <span className={`pill ${approval.status === 'pending' ? 'suggested' : ''}`}>{approval.status === 'pending' ? 'waiting' : approval.status}</span>
          </li>)}
        </ul>}
    </section>
  </>;
}
