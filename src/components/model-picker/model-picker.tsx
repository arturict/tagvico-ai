'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  buildEntries,
  favoriteEntries,
  favoriteShortcut,
  isSelected,
  shortcutAllowedFrom
} from './logic';
import { ModelPickerPanel } from './model-picker-panel';
import { ProviderLogo } from './provider-logo';
import type { PickerModel, PickerProvider, PickerSelection } from './types';
import { useFavorites } from './use-favorites';

export type ModelPickerProps = {
  providers: PickerProvider[];
  models: PickerModel[];
  selection: PickerSelection | null;
  /** Called once per choice, after the popover has closed. Choosing the current model does nothing. */
  onSelect: (model: PickerModel) => void | Promise<void>;
  /** `chip` is the ghost button in the chat header; `field` is the select-like control in a settings row. */
  variant?: 'chip' | 'field';
  /** Text of the trigger when the selection is not in the list (a manual model id, or still loading). */
  fallbackLabel: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void | Promise<void>;
  /** Called when the popover opens, for example to load a catalog that is still empty. */
  onOpen?: () => void;
  /**
   * Ctrl/Cmd+1 to +9 choose a favourite while the popover is closed. They never
   * act inside text fields other than the chat composer. While the popover is
   * open they always work. Browsers that reserve Ctrl+number for tab switching
   * keep that behaviour; Cmd+number on macOS is free.
   */
  globalShortcuts?: boolean;
  providerNote?: (provider: PickerProvider, modelCount: number) => ReactNode;
};

/**
 * The one model picker: a compact popover under the model button, with a
 * provider rail, search, favourites and keyboard selection. The chat header and
 * Settings use it; each supplies its own data and save call.
 */
export function ModelPicker({
  providers,
  models,
  selection,
  onSelect,
  variant = 'chip',
  fallbackLabel,
  disabled = false,
  loading = false,
  error = '',
  onRefresh,
  onOpen,
  globalShortcuts = false,
  providerNote
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [shortcutPrefix, setShortcutPrefix] = useState('Ctrl+');
  const searchRef = useRef<HTMLInputElement>(null);
  const { favorites, toggle } = useFavorites();

  useEffect(() => {
    // After mount, so server and first client render agree.
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcutPrefix('⌘');
  }, []);

  const entries = useMemo(() => buildEntries(providers, models), [providers, models]);
  const favoriteList = useMemo(() => favoriteEntries(entries, favorites), [entries, favorites]);
  const current = entries.find((entry) => isSelected(entry, selection));
  const currentProvider = providers.find((provider) => provider.id === selection?.providerId);

  const choose = useCallback((model: PickerModel) => {
    setOpen(false);
    const unchanged = selection?.providerId === model.providerId && selection.modelId === model.id;
    if (!unchanged) void onSelect(model);
  }, [onSelect, selection]);

  useEffect(() => {
    if (!globalShortcuts || open || disabled || loading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const number = favoriteShortcut(event);
      if (number === null || event.defaultPrevented || event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shortcutAllowedFrom(target)) return;
      const entry = favoriteList[number - 1];
      if (!entry) return;
      event.preventDefault();
      choose(entry.model);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, disabled, favoriteList, globalShortcuts, loading, open]);

  const label = current?.model.name || selection?.modelId || fallbackLabel;
  const title = currentProvider ? `${currentProvider.name} · ${label}` : undefined;

  return <Popover.Root
    open={open}
    onOpenChange={(next) => {
      setOpen(next);
      if (next) onOpen?.();
    }}
  >
    <Popover.Trigger asChild>
      {variant === 'field'
        ? <button type="button" className="select mp-trigger-field" disabled={disabled} title={title}>
            <ProviderLogo icon={currentProvider?.icon ?? null} size={18} />
            <span className="mp-trigger-text">
              <strong>{label}</strong>
              {currentProvider ? <small>{currentProvider.name}</small> : null}
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
        : <button type="button" className="btn btn-ghost mp-trigger" disabled={disabled} aria-label="Choose model" title={title}>
            {currentProvider ? <ProviderLogo icon={currentProvider.icon} size={16} /> : null}
            <span className="mp-trigger-text">{label}</span>
            <ChevronDown aria-hidden="true" />
          </button>}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="popover mp-popover"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Choose model"
        onOpenAutoFocus={(event) => {
          // Open on the search field, not on the first button of the rail.
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <ModelPickerPanel
          providers={providers}
          entries={entries}
          favorites={favorites}
          selection={selection}
          loading={loading}
          error={error}
          shortcutPrefix={shortcutPrefix}
          searchRef={searchRef}
          onChoose={choose}
          onToggleFavorite={toggle}
          onRefresh={onRefresh ? () => void onRefresh() : undefined}
          providerNote={providerNote}
        />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
