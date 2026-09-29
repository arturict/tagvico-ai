'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react';

export type ChatHistoryItem = {
  id: string;
  title: string;
  preview?: string;
  message_count?: number;
  when: string;
};

/** Recent conversations as a compact panel anchored under the chat header. */
export function ChatHistoryPanel({
  sessions,
  activeId,
  busy,
  onClose,
  onOpen,
  onNew,
  onRename,
  onDelete
}: {
  sessions: ChatHistoryItem[];
  activeId: string;
  busy: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? sessions.filter((session) => `${session.title} ${session.preview || ''}`.toLowerCase().includes(query))
      : sessions;
  }, [search, sessions]);

  return <>
    <button type="button" className="chat-history-backdrop" onClick={onClose} aria-label="Close chat history" tabIndex={-1} />
    <section className="chat-history" aria-label="Chat history">
      <div className="chat-history-head">
        <label className="chat-history-search">
          <Search aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" autoFocus />
        </label>
        <button type="button" className="chat-btn is-primary" onClick={onNew} disabled={busy}>
          <MessageSquarePlus aria-hidden="true" />New chat
        </button>
      </div>
      <nav>
        {filtered.map((session) => <div className={`chat-history-item${session.id === activeId ? ' is-active' : ''}`} key={session.id}>
          {editing === session.id ? <form className="chat-history-edit" onSubmit={async (event) => {
            event.preventDefault();
            if (await onRename(session.id, draft)) setEditing('');
          }}>
            <input autoFocus maxLength={72} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Conversation title" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Save title"><Check /></button>
            <button type="button" onClick={() => setEditing('')} aria-label="Cancel rename"><X /></button>
          </form> : <>
            <button type="button" className="chat-history-open" onClick={() => onOpen(session.id)}>
              <strong>{session.title || 'New conversation'}</strong>
              <small>{session.preview || `${Number(session.message_count) || 0} messages`} · {session.when}</small>
            </button>
            <div className="chat-history-actions">
              <button type="button" onClick={() => { setEditing(session.id); setDraft(session.title || 'New conversation'); }} aria-label={`Rename ${session.title || 'conversation'}`}><Pencil /></button>
              <button type="button" onClick={() => setConfirmDelete(session.id)} aria-label={`Delete ${session.title || 'conversation'}`}><Trash2 /></button>
            </div>
          </>}
          {confirmDelete === session.id ? <div className="chat-history-confirm">
            <span>Delete this chat?</span>
            <button type="button" onClick={async () => { if (await onDelete(session.id)) setConfirmDelete(''); }} disabled={busy}>Delete</button>
            <button type="button" onClick={() => setConfirmDelete('')}>Cancel</button>
          </div> : null}
        </div>)}
        {!filtered.length ? <p className="chat-history-empty">{sessions.length ? 'No chats match your search.' : 'No chats yet.'}</p> : null}
      </nav>
    </section>
  </>;
}
