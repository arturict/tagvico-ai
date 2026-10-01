import type { ReactNode } from 'react';
import { ChevronRight, CircleAlert, Search } from 'lucide-react';
import type { CompanionToolActivity } from '@root/contracts/companion';

const SEARCH_TOOLS = new Set(['search_documents', 'list_recent_documents']);

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** One compact line for everything the assistant looked at while answering. */
export function summarizeActivities(activities: CompanionToolActivity[]) {
  const running = activities.find((activity) => activity.status === 'running');
  const failed = activities.filter((activity) => activity.status === 'failed').length;
  const done = activities.filter((activity) => activity.status === 'succeeded');
  const searches = done.filter((activity) => SEARCH_TOOLS.has(activity.toolName));
  const searched = searches.reduce((total, activity) => total + Math.max(
    activity.result?.count ?? 0,
    activity.result?.documents?.length ?? 0
  ), 0);
  const reads = done.filter((activity) => activity.toolName === 'get_document').length;
  const counted = done.some((activity) => activity.toolName === 'count_documents');
  const tags = done.filter((activity) => ['list_tags', 'get_tag'].includes(activity.toolName)).length;
  const actions = done.filter((activity) => activity.toolName === 'list_actions').length;
  // A propose_* step only counts as a proposal when it created an approval; a declined one
  // (for example a document that already has an action) returns no approval ID.
  const proposalSteps = done.filter((activity) => activity.toolName.startsWith('propose_'));
  const proposals = proposalSteps.filter((activity) => activity.result?.approvalId).length;
  const declined = proposalSteps.filter((activity) => !activity.result?.approvalId);

  const parts: string[] = [];
  if (searches.length) parts.push(`Searched ${plural(searched, 'document')}`);
  if (counted) parts.push(parts.length ? 'counted documents' : 'Counted documents');
  if (reads) parts.push(`${parts.length ? 'read' : 'Read'} ${plural(reads, 'document')}`);
  if (tags) parts.push(`${parts.length ? 'read' : 'Read'} tags`);
  if (actions) parts.push(`${parts.length ? 'reviewed' : 'Reviewed'} actions`);
  if (proposals) parts.push(`${parts.length ? 'prepared' : 'Prepared'} ${plural(proposals, 'proposal')}`);
  if (declined.length) parts.push(`${plural(declined.length, 'proposal')} not created`);
  if (failed) parts.push(`${plural(failed, 'step')} failed`);
  return {
    running: Boolean(running),
    failed: failed > 0,
    text: running ? running.label : parts.join(' · '),
    failure: activities.find((activity) => activity.status === 'failed')?.detail || '',
    notice: declined[0]?.detail || ''
  };
}

export function ChatActivitySummary({
  activities,
  children
}: {
  activities: CompanionToolActivity[];
  children: ReactNode;
}) {
  if (!activities.length) return null;
  const summary = summarizeActivities(activities);
  if (!summary.text) return null;
  const Icon = summary.failed ? CircleAlert : Search;
  return <>
    <details className={`chat-activity${summary.failed ? ' is-failed' : ''}`}>
      <summary>
        <Icon aria-hidden="true" />
        <span className={summary.running ? 'shimmer' : undefined}>{summary.text}</span>
        <ChevronRight className="chat-activity-chevron" aria-hidden="true" />
      </summary>
      <ul className="chat-activity-steps">{children}</ul>
    </details>
    {summary.failure ? <p className="chat-activity-error" role="status">{summary.failure}</p> : null}
    {!summary.failure && summary.notice ? <p className="chat-activity-note" role="status">{summary.notice}</p> : null}
  </>;
}
