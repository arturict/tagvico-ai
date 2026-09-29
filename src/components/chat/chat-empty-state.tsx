'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, CheckSquare, FileSearch, Inbox, Receipt, Tags, type LucideIcon } from 'lucide-react';

export type SuggestionKind = 'Answer' | 'Action' | 'Approval';

const suggestions: Array<{
  kind: SuggestionKind;
  icon: LucideIcon;
  prompt: string;
  hint: string;
}> = [
  {
    kind: 'Answer',
    icon: Receipt,
    prompt: 'What must I pay this month?',
    hint: 'Finds open invoices and reminders'
  },
  {
    kind: 'Answer',
    icon: CalendarClock,
    prompt: 'When does the rental contract end?',
    hint: 'Reads the contract and cites it'
  },
  {
    kind: 'Answer',
    icon: FileSearch,
    prompt: 'Which documents are for the 2025 tax return?',
    hint: 'Lists matching documents with sources'
  },
  {
    kind: 'Action',
    icon: CheckSquare,
    prompt: 'Remind us before the next insurance renewal.',
    hint: 'Prepares a task for you to review'
  },
  {
    kind: 'Action',
    icon: Inbox,
    prompt: 'Which open actions or deadlines need my attention?',
    hint: 'Reviews your household actions'
  },
  {
    kind: 'Approval',
    icon: Tags,
    prompt: 'Clean up duplicate tags.',
    hint: 'Proposes changes, waits for approval'
  }
];

function partOfDay(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function ChatEmptyState({
  displayName,
  needsCount,
  firstRun,
  onAsk
}: {
  displayName: string;
  needsCount: number;
  firstRun?: { eyebrow: string; title: string; body: string } | null;
  onAsk: (prompt: string) => void;
}) {
  // Time of day depends on the visitor's clock, so it is filled in after mount
  // to keep server and client markup identical during hydration.
  const [clock, setClock] = useState<{ greeting: string; date: string } | null>(null);
  useEffect(() => {
    const now = new Date();
    setClock({
      greeting: partOfDay(now.getHours()),
      date: new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
    });
  }, []);

  return <div className={`chat-empty${firstRun ? ' is-first-run' : ''}`}>
    <p className="chat-eyebrow">{firstRun ? firstRun.eyebrow : clock?.date || 'Ask Tagvico'}</p>
    {firstRun ? <h2>{firstRun.title}</h2> : <h2>
      {clock?.greeting || 'Hello'}, {displayName}.<br />
      What do you want to <mark>know</mark>?
    </h2>}
    <p className="chat-empty-lead">{firstRun
      ? firstRun.body
      : 'Ask across your whole archive. Tagvico answers with sources, and turns anything that needs doing into a proposal you can approve.'}</p>
    {firstRun ? <ol className="chat-first-run-steps">
      <li><span>1</span><strong>Ask</strong><small>Start with one of the questions below.</small></li>
      <li><span>2</span><strong>Verify</strong><small>Open a numbered source to see the document.</small></li>
      <li><span>3</span><strong>Act safely</strong><small>Request an action, review it, then approve or reject.</small></li>
    </ol> : null}
    <a className={`chat-needs${needsCount ? ' has-items' : ''}`} href="/inbox">
      <span className="chat-needs-mark"><Inbox aria-hidden="true" /></span>
      <span>
        <strong>{needsCount
          ? `${needsCount} ${needsCount === 1 ? 'thing waits' : 'things wait'} for you`
          : 'Nothing waits for you'}</strong>
        <small>{needsCount ? 'Approve in chat or open the inbox' : 'Approvals and open actions appear in the inbox'}</small>
      </span>
      <ArrowRight aria-hidden="true" />
    </a>
    <div className="chat-empty-label"><span>Try asking</span><small>Any language works. Tagvico answers in yours.</small></div>
    <div className="chat-suggestions">
      {suggestions.map(({ kind, icon: Icon, prompt, hint }) => <button
        type="button"
        key={prompt}
        className={`chat-suggestion is-${kind.toLowerCase()}`}
        onClick={() => onAsk(prompt)}
      >
        <span className="chat-suggestion-kind"><Icon aria-hidden="true" />{kind}</span>
        <strong>{prompt}</strong>
        <small>{hint}</small>
      </button>)}
    </div>
  </div>;
}
