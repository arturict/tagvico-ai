'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/** Set once the tip was dismissed; remembered per browser, not per account. */
export const FIRST_CHAT_TIP_KEY = 'tagvico:tip:first-chat';

/**
 * One-time tip after setup: what to try first. It can be dismissed and then stays away in this
 * browser. It renders open so the server markup matches, and closes after mount when the browser
 * remembers that it was dismissed.
 */
export function FirstChatTip({ title, body }: { title: string; body: string }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(FIRST_CHAT_TIP_KEY)) setDismissed(true);
    } catch {
      // Without storage the tip simply shows again.
    }
  }, []);
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(FIRST_CHAT_TIP_KEY, '1');
    } catch {
      // The tip stays closed for this visit.
    }
  };
  return <aside className="chat-tip" aria-label="First steps">
    <div className="chat-tip-text">
      <h2 className="chat-tip-title">{title}</h2>
      <p>{body}</p>
    </div>
    <button type="button" className="btn btn-ghost btn-32 btn-icon chat-tip-dismiss" aria-label="Dismiss tip" onClick={dismiss}>
      <X aria-hidden="true" />
    </button>
  </aside>;
}
