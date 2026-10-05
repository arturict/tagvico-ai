'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/client/fetch-json';
import { keepIfUnchanged } from '@/lib/utils';
import { SESSIONS_CHANGED_EVENT, parseSessions, type ChatSession } from './chat-sessions';

const SESSIONS_URL = '/api/companion/sessions';

function announce(action: 'rename' | 'delete', sessionId: string) {
  window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED_EVENT, { detail: { source: 'shell', action, sessionId } }));
}

/**
 * The chat list behind the sidebar history. It starts from the server-rendered rows, reloads when
 * `refreshKey` changes (route or `?chat=` change) and whenever another part of the app reports
 * `tagvico:sessions-changed`. Rename and delete throw an Error with a readable message on failure.
 */
export function useChatSessions(initial: ChatSession[], refreshKey: string) {
  const [sessions, setSessions] = useState(initial);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const body = await fetchJson<{ sessions?: unknown }>(SESSIONS_URL, { cache: 'no-store' });
      if (request !== latestRequest.current) return;
      setSessions(keepIfUnchanged(parseSessions(body.sessions)));
      setFailed(false);
    } catch {
      // Keep the rows already shown; the list only says so when it has nothing to show.
      if (request === latestRequest.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source === 'shell') return;
      void refresh();
    };
    window.addEventListener(SESSIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    const saved = await fetchJson<{ title?: string }>(`${SESSIONS_URL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    const storedTitle = saved.title || title;
    setSessions((current) => current.map((session) => session.id === id ? { ...session, title: storedTitle } : session));
    announce('rename', id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await fetchJson(`${SESSIONS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setSessions((current) => current.filter((session) => session.id !== id));
    announce('delete', id);
  }, []);

  return { sessions, failed, rename, remove };
}
