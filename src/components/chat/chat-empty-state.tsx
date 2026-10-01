'use client';

import { CircleAlert } from 'lucide-react';
import type { CompanionSuggestion, CompanionSuggestionIcon } from '@root/services/companionResearchService';
import { COMPANION_TOOL_ERRORS } from '@root/contracts/companion';
import { shortDate } from '@/components/inbox/dates';
import { Mascot } from '@/components/mascot/mascot';
import { FirstChatTip } from './chat-tip';
import { greeting, type DayPart } from './greeting';

/** The most urgent open item of the household: the earliest due date, if any open action has one. */
export type ChatUrgentItem = { title: string; dueAt: string | null; overdue: boolean };

/** One pill per slot, taking the first icon of a slot that the real data produced a prompt for. */
const PILL_SLOTS: CompanionSuggestionIcon[][] = [
  ['calendar'],
  ['summary', 'files'],
  ['followup', 'tags']
];

export function starterPills(suggestions: CompanionSuggestion[]) {
  return PILL_SLOTS.flatMap((slot) => {
    const found = slot.map((icon) => suggestions.find((suggestion) => suggestion.icon === icon)).find(Boolean);
    return found ? [found] : [];
  });
}

/** Greeting and, when something blocks answers, one notice. The composer follows directly below. */
export function ChatEmptyState({
  displayName,
  dayPart,
  paperless,
  canManageSettings,
  firstRun
}: {
  displayName: string;
  /** Part of the day, decided on the server; without it the greeting is the plain question. */
  dayPart?: DayPart;
  paperless: 'ok' | 'unreachable' | 'access';
  canManageSettings: boolean;
  firstRun?: { title: string; body: string } | null;
}) {
  return <div className={`chat-empty${firstRun ? ' is-first-run' : ''}`}>
    <Mascot pose={firstRun ? 'waving' : 'idle'} size={64} className="chat-mascot" />
    <h1 className="type-greeting chat-greeting">{greeting(dayPart, displayName)}</h1>
    {firstRun ? <FirstChatTip title={firstRun.title} body={firstRun.body} /> : null}
    {paperless !== 'ok' ? <p className="chat-paperless-note alert is-warning" role="status">
      <CircleAlert aria-hidden="true" />
      <span>
        {paperless === 'access' ? COMPANION_TOOL_ERRORS.access : COMPANION_TOOL_ERRORS.unreachable}
        {' '}Questions about documents will not work until this is fixed.
        {canManageSettings ? <> <a href="/settings/paperless">Open Paperless settings</a></> : null}
      </span>
    </p> : null}
  </div>;
}

/** Up to three prompts built from real data and one quiet line to Needs you; hidden when nothing waits. */
export function ChatStarters({
  needsCount,
  urgent,
  suggestions,
  onAsk
}: {
  needsCount: number;
  urgent: ChatUrgentItem | null;
  suggestions: CompanionSuggestion[];
  onAsk: (prompt: string) => void;
}) {
  const pills = starterPills(suggestions);
  const more = urgent ? needsCount - 1 : needsCount;
  return <div className="chat-starters">
    {pills.length ? <div className="chat-suggestions">
      {pills.map(({ prompt }) => <button
        type="button"
        key={prompt}
        className="chat-suggestion"
        title={prompt}
        onClick={() => onAsk(prompt)}
      ><span>{prompt}</span></button>)}
    </div> : null}
    {needsCount > 0 ? <a className="chat-needs" href="/inbox">
      {urgent ? <>
        <span className="chat-needs-title">{urgent.title}</span>
        {urgent.dueAt ? <span className={urgent.overdue ? 'is-danger-text' : undefined}>
          {urgent.overdue ? ' was due ' : ' is due '}{shortDate(urgent.dueAt)}.
        </span> : <span>.</span>}
        {more > 0 ? <span> {more} more {more === 1 ? 'needs' : 'need'} you.</span> : null}
      </> : <span>{needsCount} {needsCount === 1 ? 'thing needs' : 'things need'} you.</span>}
    </a> : null}
  </div>;
}
