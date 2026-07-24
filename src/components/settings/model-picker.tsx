'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Search, Star, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { ProviderIcon } from '@/components/provider-icon';
import type { ModelDescriptor, ProviderDescriptor } from './types';

const FAVORITES_KEY = 'tagvicoModelFavoritesV3';

export function ModelPicker({
  providers,
  activeProviderId,
  activeModelId,
  models,
  loading,
  error,
  onProviderChange,
  onRefresh,
  onSelect
}: {
  providers: ProviderDescriptor[];
  activeProviderId: string;
  activeModelId: string;
  models: ModelDescriptor[];
  loading: boolean;
  error: string;
  onProviderChange: (instanceId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelect: (model: ModelDescriptor) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const provider = providers.find((candidate) => candidate.instanceId === activeProviderId);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
      setFavorites(Array.isArray(stored) ? stored.map(String) : []);
    } catch {
      setFavorites([]);
    }
  }, []);

  const favoriteKey = (modelId: string) => `${activeProviderId}:${modelId}`;
  const visibleModels = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...models]
      .filter((model) => !normalized || `${model.name} ${model.id}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => {
        const favoriteDifference = Number(favorites.includes(favoriteKey(right.id)))
          - Number(favorites.includes(favoriteKey(left.id)));
        if (favoriteDifference) return favoriteDifference;
        if (left.isDefault !== right.isDefault) return Number(right.isDefault) - Number(left.isDefault);
        return left.name.localeCompare(right.name);
      });
  }, [activeProviderId, favorites, models, query]);

  const toggleFavorite = (modelId: string) => {
    const key = favoriteKey(modelId);
    setFavorites((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  return <Dialog.Root onOpenChange={(open) => {
    if (open && !models.length && !loading) void onRefresh();
    if (!open) setQuery('');
  }}>
    <Dialog.Trigger asChild>
      <button className="settings-model-trigger" type="button">
        <span className="settings-model-trigger-provider">
          <ProviderIcon icon={provider?.icon || null} name={provider?.name || activeProviderId} />
          <span>
            <small>{provider?.name || activeProviderId}</small>
            <strong>{activeModelId || 'Choose a model'}</strong>
          </span>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="settings-dialog-overlay" />
      <Dialog.Content className="settings-model-dialog" aria-describedby="model-picker-description">
        <header className="settings-dialog-head">
          <div>
            <Dialog.Title>Provider and model</Dialog.Title>
            <Dialog.Description id="model-picker-description">
              Availability and capabilities come from the selected runtime.
            </Dialog.Description>
          </div>
          <Dialog.Close className="settings-icon-button" aria-label="Close model picker">
            <X aria-hidden="true" />
          </Dialog.Close>
        </header>
        <div className="settings-model-layout">
          <nav className="settings-provider-rail" aria-label="AI providers">
            {providers.map((candidate) => <button
              key={candidate.instanceId}
              type="button"
              className={candidate.instanceId === activeProviderId ? 'is-active' : undefined}
              disabled={!candidate.available}
              onClick={() => void onProviderChange(candidate.instanceId)}
            >
              <span className="settings-provider-label">
                <ProviderIcon icon={candidate.icon} name={candidate.name} />
                <span>{candidate.name}</span>
              </span>
              {!candidate.available ? <small>Unavailable</small> : candidate.recommended ? <small>Recommended</small> : null}
            </button>)}
          </nav>
          <div className="settings-model-results">
            <div className="settings-model-toolbar">
              <label className="settings-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Search models</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search live models…" autoFocus />
              </label>
              <button className="settings-icon-button" type="button" onClick={() => void onRefresh()} disabled={loading} aria-label="Refresh live models">
                <RefreshCw className={loading ? 'is-spinning' : undefined} aria-hidden="true" />
              </button>
            </div>
            <div className="settings-model-list">
              {loading ? <div className="settings-model-empty">Loading the runtime catalog…</div> : null}
              {!loading && error ? <div className="settings-model-empty is-error">{error}</div> : null}
              {!loading && !error && !visibleModels.length ? <div className="settings-model-empty">
                {provider?.manualModelInput
                  ? 'No live models returned. Close this picker and enter a model ID manually.'
                  : 'The runtime returned no selectable models.'}
              </div> : null}
              {visibleModels.map((model) => {
                const isFavorite = favorites.includes(favoriteKey(model.id));
                return <div className="settings-model-row" key={model.id}>
                  <Dialog.Close asChild>
                    <button type="button" className="settings-model-choice" onClick={() => void onSelect(model)}>
                      <span className="settings-model-copy">
                        <strong>{model.name}</strong>
                        <small>{model.id}</small>
                        <span className="settings-capabilities">
                          {model.isDefault ? <span>Runtime default</span> : null}
                          {model.options.map((option) => <span key={option.id}>{option.label}</span>)}
                          {model.contextWindow ? <span>{Math.round(model.contextWindow / 1000)}k context</span> : null}
                        </span>
                      </span>
                      {model.id === activeModelId ? <Check aria-label="Selected" /> : null}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    className={`settings-favorite${isFavorite ? ' is-active' : ''}`}
                    onClick={() => toggleFavorite(model.id)}
                    aria-label={isFavorite ? `Remove ${model.name} from favorites` : `Add ${model.name} to favorites`}
                  >
                    <Star aria-hidden="true" />
                  </button>
                </div>;
              })}
            </div>
            {provider?.suggestedModels.length ? <div className="settings-suggestions">
              <h3>Curated suggestions</h3>
              <p>Suggestions are not presented as account availability.</p>
              <div>
                {provider.suggestedModels.map((suggestion) => <span key={suggestion.id} title={suggestion.description}>
                  {suggestion.name}
                </span>)}
              </div>
            </div> : null}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
