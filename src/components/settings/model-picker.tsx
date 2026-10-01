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

  const capabilities = (model: ModelDescriptor) => [
    /(^|\/)gpt-6-luna$/i.test(model.id) ? 'Recommended' : '',
    model.isDefault ? 'Runtime default' : '',
    model.capabilities.includes('tools') ? 'Tools' : '',
    model.capabilities.includes('vision') ? 'Vision' : '',
    model.capabilities.includes('thinking') ? 'Thinking' : '',
    ...model.options.map((option) => option.label),
    model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k context` : ''
  ].filter(Boolean).join(' · ');

  return <Dialog.Root onOpenChange={(open) => {
    if (open && !models.length && !loading) void onRefresh();
    if (!open) setQuery('');
  }}>
    <Dialog.Trigger asChild>
      <button className="set-model-trigger select" type="button">
        <ProviderIcon icon={provider?.icon || null} name={provider?.name || activeProviderId} size={20} />
        <span className="set-model-trigger-text">
          <strong>{activeModelId || 'Choose a model'}</strong>
          <small>{provider?.name || activeProviderId}</small>
        </span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog is-wide set-model-dialog" aria-describedby="model-picker-description">
        <header className="set-dialog-head">
          <div>
            <Dialog.Title>Provider and model</Dialog.Title>
            <Dialog.Description id="model-picker-description">
              Availability and capabilities come from the selected runtime.
            </Dialog.Description>
          </div>
          <Dialog.Close className="btn btn-ghost btn-icon btn-32" aria-label="Close model picker">
            <X aria-hidden="true" />
          </Dialog.Close>
        </header>
        <div className="set-model-layout">
          <nav className="set-provider-rail" aria-label="AI providers">
            {providers.map((candidate) => <button
              key={candidate.instanceId}
              type="button"
              className={candidate.instanceId === activeProviderId ? 'is-active' : undefined}
              disabled={!candidate.available}
              onClick={() => void onProviderChange(candidate.instanceId)}
            >
              <ProviderIcon icon={candidate.icon} name={candidate.name} size={18} />
              <span>{candidate.name}</span>
              {!candidate.available ? <small>Unavailable</small> : candidate.recommended ? <small>Recommended</small> : null}
            </button>)}
          </nav>
          <div className="set-model-results">
            <div className="set-model-toolbar">
              <label className="set-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Search models</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search live models…" autoFocus />
              </label>
              <button className="btn btn-ghost btn-icon btn-32" type="button" onClick={() => void onRefresh()} disabled={loading} aria-label="Refresh live models">
                <RefreshCw className={loading ? 'is-spinning' : undefined} aria-hidden="true" />
              </button>
            </div>
            <div className="set-model-list">
              {loading ? <div className="set-model-skeleton" aria-label="Loading the runtime catalog">
                {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
              </div> : null}
              {!loading && error ? <div className="set-model-empty is-error">{error}</div> : null}
              {!loading && !error && !visibleModels.length ? <div className="set-model-empty">
                {provider?.manualModelInput
                  ? 'No live models returned. Close this picker and enter a model ID manually.'
                  : 'The runtime returned no selectable models.'}
              </div> : null}
              {visibleModels.map((model) => {
                const isFavorite = favorites.includes(favoriteKey(model.id));
                const traits = capabilities(model);
                return <div className="set-model-row" key={model.id}>
                  <Dialog.Close asChild>
                    <button type="button" className="set-model-choice" onClick={() => void onSelect(model)}>
                      <span className="set-model-copy">
                        <strong>{model.name}</strong>
                        <small>{model.id}</small>
                        {traits ? <small className="set-model-capabilities">{traits}</small> : null}
                      </span>
                      {model.id === activeModelId ? <Check aria-label="Selected" /> : null}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    className={`set-favorite${isFavorite ? ' is-active' : ''}`}
                    onClick={() => toggleFavorite(model.id)}
                    aria-label={isFavorite ? `Remove ${model.name} from favorites` : `Add ${model.name} to favorites`}
                  >
                    <Star aria-hidden="true" />
                  </button>
                </div>;
              })}
            </div>
            {provider?.suggestedModels.length ? <div className="set-suggestions">
              <h3>Curated suggestions</h3>
              <p>{provider.suggestedModels.map((suggestion) => suggestion.name).join(', ')}. Not a statement about what your account can use.</p>
            </div> : null}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
