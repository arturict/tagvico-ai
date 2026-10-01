'use client';

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'tagvico:draft:';

/** Storage key of the unsent message of one chat. */
export function draftKey(sessionId: string) {
  return `${PREFIX}${sessionId}`;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Saves a draft; an empty one removes the entry. Storage can be unavailable (private mode, quota), which only loses the draft. */
export function saveDraft(storage: DraftStorage, sessionId: string, text: string) {
  try {
    if (text.trim()) storage.setItem(draftKey(sessionId), text);
    else storage.removeItem(draftKey(sessionId));
  } catch {
    // The draft is a convenience; nothing else depends on it.
  }
}

export function loadDraft(storage: DraftStorage, sessionId: string) {
  try {
    return storage.getItem(draftKey(sessionId)) ?? '';
  } catch {
    return '';
  }
}

/**
 * The message box of one chat with its unsent text kept per chat in this browser, so switching to
 * another chat and back does not lose a half-written question. The saved draft is restored after
 * mount, which keeps the server render and the first client render identical.
 */
export function useDraft(sessionId: string) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const saved = loadDraft(window.localStorage, sessionId);
    if (saved) setValue((current) => current || saved);
  }, [sessionId]);
  const update = useCallback((text: string) => {
    setValue(text);
    saveDraft(window.localStorage, sessionId, text);
  }, [sessionId]);
  return [value, update] as const;
}
