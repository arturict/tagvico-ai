'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Check, RefreshCw, Search, Star } from 'lucide-react';
import {
  favoriteEntries,
  initialActiveIndex,
  initialRail,
  isSelected,
  listKeyAction,
  shortcutNumber,
  visibleEntries
} from './logic';
import { ProviderLogo } from './provider-logo';
import type { PickerEntry, PickerModel, PickerProvider, PickerRail, PickerSelection } from './types';

export type ModelPickerPanelProps = {
  providers: PickerProvider[];
  entries: PickerEntry[];
  favorites: string[];
  selection: PickerSelection | null;
  loading: boolean;
  error: string;
  /** Shown in place of the browser-specific shortcut label, for example "Ctrl+" or "⌘". */
  shortcutPrefix: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  onChoose: (model: PickerModel) => void;
  onToggleFavorite: (key: string) => void;
  onRefresh?: () => void;
  /** Content for a provider's rail view: an explanation when it has no models, or a note under its list. */
  providerNote?: (provider: PickerProvider, modelCount: number) => ReactNode;
};

export function ModelPickerPanel({
  providers,
  entries,
  favorites,
  selection,
  loading,
  error,
  shortcutPrefix,
  searchRef,
  onChoose,
  onToggleFavorite,
  onRefresh,
  providerNote
}: ModelPickerPanelProps) {
  const uid = useId();
  const listId = `${uid}-models`;
  const optionId = (index: number) => `${uid}-option-${index}`;
  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [rail, setRail] = useState<PickerRail>(() => initialRail(entries, providers, selection));
  const [active, setActive] = useState(() => initialActiveIndex(
    visibleEntries(entries, favorites, initialRail(entries, providers, selection), ''),
    selection
  ));

  const searching = query.trim().length > 0;
  const visible = useMemo(
    () => visibleEntries(entries, favorites, rail, query),
    [entries, favorites, rail, query]
  );
  const favoriteList = useMemo(() => favoriteEntries(entries, favorites), [entries, favorites]);
  const activeIndex = visible.length ? Math.min(active, visible.length - 1) : -1;
  const railProvider = rail.kind === 'provider'
    ? providers.find((provider) => provider.id === rail.providerId)
    : undefined;

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[id="${uid}-option-${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, visible, uid]);

  const selectRail = (next: PickerRail) => {
    setRail(next);
    setQuery('');
    setActive(initialActiveIndex(visibleEntries(entries, favorites, next, ''), selection));
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = listKeyAction(event, { count: visible.length, active: activeIndex, favoriteCount: favoriteList.length });
    if (!action) return;
    event.preventDefault();
    if (action.type === 'move') setActive(action.index);
    else if (action.type === 'select') {
      if (activeIndex >= 0) onChoose(visible[activeIndex].model);
    } else onChoose(favoriteList[action.entryIndex].model);
  };

  // Ctrl/Cmd+number picks a favourite from anywhere inside the popover, not only from the search field.
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === searchRef?.current) return;
    const action = listKeyAction(event, { count: 0, active: -1, favoriteCount: favoriteList.length });
    if (action?.type !== 'favorite') return;
    event.preventDefault();
    onChoose(favoriteList[action.entryIndex].model);
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(railRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  };

  const hasProviders = providers.length > 0;
  const showNote = !searching && railProvider && providerNote;
  const note = showNote ? providerNote(railProvider, visible.length) : null;

  return <div className="mp-panel" onKeyDown={onPanelKeyDown}>
    <div className="mp-rail" role="group" aria-label="Filter by provider" ref={railRef} onKeyDown={onRailKeyDown}>
      <button
        type="button"
        className="mp-rail-item"
        aria-pressed={!searching && rail.kind === 'favorites'}
        aria-label="Favourites"
        title="Favourites"
        onClick={() => selectRail({ kind: 'favorites' })}
      >
        <Star aria-hidden="true" />
      </button>
      {providers.map((provider) => <button
        key={provider.id}
        type="button"
        className="mp-rail-item"
        aria-pressed={!searching && rail.kind === 'provider' && rail.providerId === provider.id}
        aria-label={provider.name}
        title={provider.available === false ? `${provider.name} (unavailable)` : provider.name}
        disabled={provider.available === false}
        onClick={() => selectRail({ kind: 'provider', providerId: provider.id })}
      >
        <ProviderLogo icon={provider.icon} size={18} />
      </button>)}
    </div>
    <div className="mp-main">
      <div className="mp-search">
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="text"
          role="combobox"
          aria-label="Search models"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search models..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onSearchKeyDown}
        />
        {onRefresh ? <button
          type="button"
          className="mp-icon-button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh models"
          title="Refresh models"
        >
          <RefreshCw className={loading ? 'chat-spin' : undefined} aria-hidden="true" />
        </button> : null}
      </div>
      <div className="mp-scroll" ref={listRef}>
        {loading && !visible.length ? <div className="mp-skeleton" aria-busy="true" aria-label="Loading models">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div> : null}
        {!loading && error ? <p className="mp-empty is-error" role="alert">{error}</p> : null}
        <div
          id={listId}
          role="listbox"
          aria-label="Models"
          className="mp-list"
          hidden={!visible.length}
        >
          {visible.map((entry, index) => {
            const selected = isSelected(entry, selection);
            const favorite = favorites.includes(entry.key);
            const shortcut = favorite ? shortcutNumber(favoriteList, entry.key) : null;
            const badges = [...(entry.model.badges ?? []), entry.provider.badge].filter((badge): badge is string => Boolean(badge)).slice(0, 2);
            return <div
              role="presentation"
              className="mp-row"
              data-active={index === activeIndex || undefined}
              key={entry.key}
            >
              <div
                role="option"
                id={optionId(index)}
                aria-selected={selected}
                className="mp-option"
                data-model-id={entry.model.id}
                data-provider-id={entry.provider.id}
                onClick={() => onChoose(entry.model)}
                onMouseMove={() => { if (index !== activeIndex) setActive(index); }}
              >
                <span className="mp-copy">
                  <span className="mp-name-line">
                    <span className="mp-name">{entry.model.name}</span>
                    {badges.map((badge) => <span className="mp-badge" key={badge}>{badge}</span>)}
                  </span>
                  <span className="mp-provider-line">
                    <ProviderLogo icon={entry.provider.icon} size={14} />
                    <span className="mp-provider-name">{entry.provider.name}</span>
                    {entry.model.id !== entry.model.name
                      ? <span className="mp-model-id">{entry.model.id}</span>
                      : null}
                  </span>
                </span>
                <span className="mp-trail">
                  {selected ? <Check className="mp-check" aria-hidden="true" /> : null}
                  {shortcut ? <kbd className="mp-kbd" aria-hidden="true">{shortcutPrefix}{shortcut}</kbd> : null}
                </span>
              </div>
              <button
                type="button"
                className={`mp-star${favorite ? ' is-active' : ''}`}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => onToggleFavorite(entry.key)}
                aria-label={favorite ? `Remove ${entry.model.name} from favourites` : `Add ${entry.model.name} to favourites`}
              >
                <Star aria-hidden="true" />
              </button>
            </div>;
          })}
        </div>
        {!loading && !error && !visible.length && !note ? <p className="mp-empty">
          {searching
            ? 'No model matches your search.'
            : rail.kind === 'favorites'
              ? 'No favourites yet. Star a model to pin it here.'
              : hasProviders ? 'No models listed for this provider.' : 'No connected provider listed a model.'}
        </p> : null}
        {note ? <div className="mp-note">{note}</div> : null}
      </div>
    </div>
  </div>;
}
