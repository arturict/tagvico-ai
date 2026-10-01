'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Ellipsis, Pencil, Trash2, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { chatTitle, groupSessions, type ChatSession } from './chat-sessions';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type RowMode = 'view' | 'rename' | 'delete';

/** One chat: a link to it, a "..." menu on hover or focus, and inline rename and delete confirmation. */
function ChatRow({ session, active, onRename, onDelete }: {
  session: ChatSession;
  active: boolean;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<RowMode>('view');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The menu returns focus to its trigger when it closes. Rename and delete replace the row with a
  // form, so the trigger is gone and focus belongs to the new control instead.
  const keepFocusAway = useRef(false);
  const title = chatTitle(session);

  const begin = (next: RowMode) => {
    keepFocusAway.current = true;
    setError('');
    setDraft(title);
    setMode(next);
  };
  const leave = () => {
    setMode('view');
    setError('');
  };
  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setMode('view');
    } catch (cause) {
      setError(errorMessage(cause, fallback));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'rename') {
    const next = draft.trim();
    return <li className="chat-row is-editing">
      <form className="chat-row-edit" onSubmit={(event) => {
        event.preventDefault();
        if (!next || next === title) return leave();
        void run(() => onRename(session.id, next), 'Could not rename the chat.');
      }}>
        <input
          className="input input-32"
          autoFocus
          maxLength={72}
          value={draft}
          aria-label="Conversation title"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); leave(); } }}
        />
        <button type="submit" className="btn btn-ghost btn-icon btn-28" aria-label="Save title" disabled={busy || !next}><Check aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-28" aria-label="Cancel rename" onClick={leave}><X aria-hidden="true" /></button>
      </form>
      {error ? <p className="field-error chat-row-error" role="alert">{error}</p> : null}
    </li>;
  }

  if (mode === 'delete') {
    return <li className="chat-row is-editing">
      <div className="chat-row-confirm" role="group" aria-label={`Delete ${title}`}>
        <span className="chat-row-confirm-text">Delete this chat?</span>
        <button type="button" className="btn btn-danger btn-28" autoFocus disabled={busy} onClick={() => void run(() => onDelete(session.id), 'Could not delete the chat.')}>Delete</button>
        <button type="button" className="btn btn-secondary btn-28" onClick={leave}>Cancel</button>
      </div>
      {error ? <p className="field-error chat-row-error" role="alert">{error}</p> : null}
    </li>;
  }

  return <li className={`chat-row${active ? ' is-active' : ''}`}>
    <Link href={`/companion?chat=${encodeURIComponent(session.id)}`} className="chat-row-link" aria-current={active ? 'page' : undefined} title={title}>
      <span className="chat-row-title">{title}</span>
    </Link>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="chat-row-menu btn btn-ghost btn-icon btn-28" aria-label={`Options for ${title}`}><Ellipsis aria-hidden="true" /></button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu shell-menu"
          align="start"
          side="bottom"
          sideOffset={4}
          onCloseAutoFocus={(event) => {
            if (!keepFocusAway.current) return;
            keepFocusAway.current = false;
            event.preventDefault();
          }}
        >
          <DropdownMenu.Item className="menu-item" onSelect={() => begin('rename')}><Pencil aria-hidden="true" />Rename</DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item is-danger" onSelect={() => begin('delete')}><Trash2 aria-hidden="true" />Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </li>;
}

/** The "Chats" section: conversations grouped by recency, newest first. */
export function ChatHistory({ sessions, failed, activeChatId, onRename, onDelete }: {
  sessions: ChatSession[];
  failed: boolean;
  activeChatId: string;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const groups = groupSessions(sessions);
  return <section className="sidebar-section chat-history-section" aria-label="Chats">
    <h2 className="sidebar-section-title">Chats</h2>
    {groups.map((group) => <div key={group.label} className="chat-group">
      <h3 className="list-group-heading">{group.label}</h3>
      <ul className="list chat-list">
        {group.sessions.map((session) => <ChatRow key={session.id} session={session} active={session.id === activeChatId} onRename={onRename} onDelete={onDelete} />)}
      </ul>
    </div>)}
    {!groups.length ? <p className="meta sidebar-note">{failed ? 'Chats could not be loaded.' : 'No chats yet.'}</p> : null}
  </section>;
}
