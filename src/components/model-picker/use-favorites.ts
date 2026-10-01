'use client';

import { useCallback, useEffect, useState } from 'react';
import { FAVORITES_KEY, parseFavorites, toggleFavorite } from './logic';

/**
 * Favourite models, kept per browser in localStorage. Every picker on the page
 * reads the same list, and a change in another tab arrives through the
 * `storage` event.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      try {
        setFavorites(parseFavorites(window.localStorage.getItem(FAVORITES_KEY)));
      } catch {
        setFavorites([]);
      }
    };
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FAVORITES_KEY) read();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((key: string) => {
    setFavorites((current) => {
      const next = toggleFavorite(current, key);
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // Private browsing can refuse storage; the star still works until the page closes.
      }
      return next;
    });
  }, []);

  return { favorites, toggle };
}
