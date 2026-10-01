import type {
  PickerEntry,
  PickerModel,
  PickerProvider,
  PickerRail,
  PickerSelection
} from './types';

/** Same key and value shape as the earlier Settings picker, so existing favourites carry over. */
export const FAVORITES_KEY = 'tagvicoModelFavoritesV3';
/** Ctrl/Cmd+1 to +9 reach the first nine favourites. */
export const SHORTCUT_LIMIT = 9;

export function favoriteKey(providerId: string, modelId: string) {
  return `${providerId}:${modelId}`;
}

export function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

export function toggleFavorite(favorites: string[], key: string): string[] {
  return favorites.includes(key) ? favorites.filter((item) => item !== key) : [...favorites, key];
}

export function buildEntries(providers: PickerProvider[], models: PickerModel[]): PickerEntry[] {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return models.flatMap((model) => {
    const provider = byId.get(model.providerId);
    return provider ? [{ key: favoriteKey(provider.id, model.id), provider, model }] : [];
  });
}

/** Favourites in the order they were starred; this order is also the Ctrl/Cmd+number order. */
export function favoriteEntries(entries: PickerEntry[], favorites: string[]): PickerEntry[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return favorites.flatMap((key) => {
    const entry = byKey.get(key);
    return entry ? [entry] : [];
  });
}

/** 1-based shortcut number of a favourite, or null when it has none. */
export function shortcutNumber(favorites: PickerEntry[], key: string): number | null {
  const index = favorites.findIndex((entry) => entry.key === key);
  return index >= 0 && index < SHORTCUT_LIMIT ? index + 1 : null;
}

/**
 * The rows for the rail and the search. A query searches every provider and
 * ignores the rail; every word must match the name, id or provider name.
 */
export function visibleEntries(
  entries: PickerEntry[],
  favorites: string[],
  rail: PickerRail,
  query: string
): PickerEntry[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    return entries.filter((entry) => {
      const haystack = `${entry.model.name} ${entry.model.id} ${entry.provider.name}`.toLocaleLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }
  if (rail.kind === 'favorites') return favoriteEntries(entries, favorites);
  return entries.filter((entry) => entry.provider.id === rail.providerId);
}

export function isSelected(entry: PickerEntry, selection: PickerSelection | null) {
  return selection !== null
    && selection.providerId === entry.provider.id
    && selection.modelId === entry.model.id;
}

/** Where the rail starts when the popover opens: on the provider of the current model, so its check is in view. */
export function initialRail(entries: PickerEntry[], providers: PickerProvider[], selection: PickerSelection | null): PickerRail {
  const providerId = selection && providers.some((provider) => provider.id === selection.providerId)
    ? selection.providerId
    : entries[0]?.provider.id ?? providers[0]?.id;
  return providerId ? { kind: 'provider', providerId } : { kind: 'favorites' };
}

export function initialActiveIndex(visible: PickerEntry[], selection: PickerSelection | null) {
  const selected = visible.findIndex((entry) => isSelected(entry, selection));
  return selected >= 0 ? selected : 0;
}

export type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

/** Ctrl (Windows, Linux) or Cmd (macOS) plus 1 to 9, without other modifiers. */
export function favoriteShortcut(event: KeyLike): number | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  return /^[1-9]$/.test(event.key) ? Number(event.key) : null;
}

export type ListKeyAction =
  | { type: 'move'; index: number }
  | { type: 'select' }
  | { type: 'favorite'; entryIndex: number };

/**
 * What a key does inside the open popover. Arrows wrap around, Home and End
 * jump, Enter chooses the highlighted row, Ctrl/Cmd+number chooses a favourite.
 * Escape is left to the popover, which closes and returns focus to the trigger.
 */
export function listKeyAction(
  event: KeyLike,
  state: { count: number; active: number; favoriteCount: number }
): ListKeyAction | null {
  const shortcut = favoriteShortcut(event);
  if (shortcut !== null) {
    return shortcut <= Math.min(state.favoriteCount, SHORTCUT_LIMIT)
      ? { type: 'favorite', entryIndex: shortcut - 1 }
      : null;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (state.count === 0) return null;
  switch (event.key) {
    case 'ArrowDown':
      return { type: 'move', index: (state.active + 1) % state.count };
    case 'ArrowUp':
      return { type: 'move', index: (state.active - 1 + state.count) % state.count };
    case 'Home':
      return { type: 'move', index: 0 };
    case 'End':
      return { type: 'move', index: state.count - 1 };
    case 'Enter':
      return { type: 'select' };
    default:
      return null;
  }
}

/**
 * Whether a shortcut pressed while the popover is closed may act. Text fields
 * keep their keys, except the chat composer (`.chat-composer`), which is where
 * people are when they want to change the model before sending.
 */
export function shortcutAllowedFrom(target: {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
} | null) {
  if (!target) return true;
  if (target.closest?.('.chat-composer')) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
  return !target.isContentEditable;
}
