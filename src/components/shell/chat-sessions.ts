import { addDays, zurichDateOf, zurichToday } from '@/components/inbox/dates';

/** The part of a stored chat session the sidebar needs; `GET /api/companion/sessions` returns more. */
export interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

/**
 * Window event for "the list of chats changed": the chat page dispatches it after it creates or
 * renames a session, the sidebar listens and reloads. The sidebar itself dispatches it with
 * `detail.source === 'shell'` after a rename or delete so the chat page can follow, and ignores
 * those events when it hears them back.
 */
export const SESSIONS_CHANGED_EVENT = 'tagvico:sessions-changed';

export type ChatGroupLabel = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export interface ChatGroup {
  label: ChatGroupLabel;
  sessions: ChatSession[];
}

const GROUP_ORDER: ChatGroupLabel[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

/** Reads the API response defensively; rows that do not look like a session are dropped. */
export function parseSessions(value: unknown): ChatSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: ChatSession[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const { id, title, updated_at: updatedAt, message_count: messageCount } = row as Record<string, unknown>;
    if (typeof id !== 'string' || !id) continue;
    sessions.push({
      id,
      title: typeof title === 'string' ? title : '',
      updated_at: typeof updatedAt === 'string' ? updatedAt : '',
      message_count: Number(messageCount) || 0
    });
  }
  return sessions;
}

/** Empty conversations are stored as "New conversation"; the interface calls them "New chat". */
export function chatTitle(session: Pick<ChatSession, 'title'>) {
  const title = session.title.trim();
  return !title || title === 'New conversation' ? 'New chat' : title;
}

/**
 * Chats worth listing: the ones with messages, plus the open one even while it is still empty so
 * the highlighted row exists right after "New chat".
 */
export function listedSessions(sessions: ChatSession[], activeId: string) {
  return sessions.filter((session) => session.message_count > 0 || session.id === activeId);
}

/** Buckets chats by the Zurich calendar day of their last update, keeping the order the API sent (newest first). */
export function groupSessions(sessions: ChatSession[], now: Date = new Date()): ChatGroup[] {
  const today = zurichToday(now);
  const yesterday = addDays(today, -1);
  const weekStart = addDays(today, -7);
  const buckets = new Map<ChatGroupLabel, ChatSession[]>(GROUP_ORDER.map((label) => [label, []]));
  for (const session of sessions) {
    const day = zurichDateOf(session.updated_at);
    const label: ChatGroupLabel = !day || day < weekStart
      ? 'Older'
      : day >= today ? 'Today' : day === yesterday ? 'Yesterday' : 'Previous 7 days';
    buckets.get(label)?.push(session);
  }
  return GROUP_ORDER.flatMap((label) => {
    const grouped = buckets.get(label) || [];
    return grouped.length ? [{ label, sessions: grouped }] : [];
  });
}
