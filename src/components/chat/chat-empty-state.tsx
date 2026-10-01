'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, CheckSquare, CircleAlert, FileSearch, FileText, Inbox, Tag, Tags, type LucideIcon } from 'lucide-react';
import type { CompanionSuggestion, CompanionSuggestionIcon } from '@root/services/companionResearchService';
import { COMPANION_TOOL_ERRORS } from '@root/contracts/companion';

const icons: Record<CompanionSuggestionIcon, LucideIcon> = {
  calendar: CalendarClock,
  files: FileSearch,
  summary: FileText,
  tags: Tags,
  followup: CheckSquare,
  'tag-create': Tag
};

function partOfDay(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function ChatEmptyState({
  displayName,
  needsCount,
  suggestions,
  paperless,
  canManageSettings,
  firstRun,
  onAsk
}: {
  displayName: string;
  needsCount: number;
  suggestions: CompanionSuggestion[];
  paperless: 'ok' | 'unreachable' | 'access';
  canManageSettings: boolean;
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
    <p className="chat-eyebrow">{firstRun ? firstRun.eyebrow : clock?.date || 'Chat'}</p>
    {firstRun ? <h2>{firstRun.title}</h2> : <h2>
      {clock?.greeting || 'Hello'}, {displayName}.<br />
      What do you want to <mark>know</mark>?
    </h2>}
    <p className="chat-empty-lead">{firstRun
      ? firstRun.body
      : 'Ask across your whole archive. Answers cite their sources, and anything that needs doing becomes a proposal you can approve.'}</p>
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
        <small>{needsCount ? 'Open the inbox to see approvals, reviews and deadlines' : 'Approvals, reviews and deadlines appear in the inbox'}</small>
      </span>
      <ArrowRight aria-hidden="true" />
    </a>
    {paperless !== 'ok' ? <p className="chat-paperless-note" role="status">
      <CircleAlert aria-hidden="true" />
      <span>
        {paperless === 'access' ? COMPANION_TOOL_ERRORS.access : COMPANION_TOOL_ERRORS.unreachable}
        {' '}Questions about documents will not work until this is fixed.
        {canManageSettings ? <> <a href="/settings/paperless">Open Paperless settings</a></> : null}
      </span>
    </p> : null}
    <div className="chat-empty-label"><span>Try asking</span><small>Any language works. Tagvico answers in yours.</small></div>
    <div className="chat-suggestions">
      {suggestions.map(({ kind, icon, prompt, hint }) => {
        const Icon = icons[icon];
        return <button
          type="button"
          key={prompt}
          className={`chat-suggestion is-${kind.toLowerCase()}`}
          onClick={() => onAsk(prompt)}
        >
          <span className="chat-suggestion-kind"><Icon aria-hidden="true" />{kind}</span>
          <strong>{prompt}</strong>
          <small>{hint}</small>
        </button>;
      })}
    </div>
  </div>;
}
