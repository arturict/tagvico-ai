'use client';

import { useEffect } from 'react';
import { tabTitle } from './title';

/**
 * Keeps the browser tab title in step with the Needs-you count. The framework sets the title of
 * each page after navigation, so a MutationObserver puts the count back whenever it changes.
 */
export function DocumentTitle({ needsCount, onNeedsYouPage }: { needsCount: number; onNeedsYouPage: boolean }) {
  useEffect(() => {
    const apply = () => {
      const next = tabTitle(document.title, needsCount, onNeedsYouPage);
      if (next !== document.title) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [needsCount, onNeedsYouPage]);
  return null;
}
