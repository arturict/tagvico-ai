'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Search, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { ProviderIcon } from '@/components/provider-icon';
import type {
  CompanionModelCatalog,
  CompanionModelSelection
} from '@root/contracts/companion';

type CatalogResponse = CompanionModelCatalog & {
  selection: CompanionModelSelection | null;
};

export function CompanionModelPicker({ sessionId }: { sessionId: string }) {
  const [catalog, setCatalog] = useState<CompanionModelCatalog>({ providers: [], defaultSelection: null });
  const [selection, setSelection] = useState<CompanionModelSelection | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/companion/models?sessionId=${encodeURIComponent(sessionId)}${refresh ? '&refresh=1' : ''}`,
        { cache: 'no-store' }
      );
      const body = await response.json().catch(() => ({})) as Partial<CatalogResponse> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load configured models');
      setCatalog({
        providers: Array.isArray(body.providers) ? body.providers : [],
        defaultSelection: body.defaultSelection || null
      });
      setSelection(body.selection || body.defaultSelection || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load configured models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [sessionId]);

  const selectedProvider = catalog.providers.find(
    (provider) => provider.instanceId === selection?.providerInstanceId
  );
  const selectedModel = selectedProvider?.models.find(
    (model) => model.id === selection?.modelId
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProviders = useMemo(() => catalog.providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) => !normalizedQuery
        || `${provider.name} ${model.name} ${model.id}`.toLocaleLowerCase().includes(normalizedQuery))
    }))
    .filter((provider) => provider.models.length), [catalog.providers, normalizedQuery]);

  const choose = async (next: CompanionModelSelection) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/companion/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, selection: next })
      });
      const body = await response.json().catch(() => ({})) as { error?: string; selection?: CompanionModelSelection };
      if (!response.ok) throw new Error(body.error || 'Could not select this model');
      const persisted = body.selection || next;
      setSelection({
        providerInstanceId: persisted.providerInstanceId,
        modelId: persisted.modelId
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select this model');
    } finally {
      setSaving(false);
    }
  };

  return <div className="companion-model-control">
    <Dialog.Root onOpenChange={(open) => {
      if (!open) setQuery('');
    }}>
      <Dialog.Trigger asChild>
        <button
          className="companion-model-trigger"
          type="button"
          disabled={loading || saving || !catalog.providers.length}
          aria-label="Choose Companion model"
        >
          <ProviderIcon icon={selectedProvider?.icon || null} name={selectedProvider?.name || 'AI provider'} />
          <span>
            <small>{selectedProvider?.name || (loading ? 'Loading models' : 'No verified provider')}</small>
            <strong>{selectedModel?.name || selection?.modelId || 'Configure a model'}</strong>
          </span>
          <ChevronDown aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-dialog-overlay" />
        <Dialog.Content className="companion-model-dialog" aria-describedby="companion-model-description">
          <header className="settings-dialog-head">
            <div>
              <Dialog.Title>Companion model</Dialog.Title>
              <Dialog.Description id="companion-model-description">
                Only configured providers whose live model catalog passed verification appear here.
              </Dialog.Description>
            </div>
            <Dialog.Close className="settings-icon-button" aria-label="Close model picker">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="companion-model-toolbar">
            <label className="settings-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search configured models</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search configured models…"
                autoFocus
              />
            </label>
            <button
              className="settings-icon-button"
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              aria-label="Refresh verified models"
            >
              <RefreshCw className={loading ? 'is-spinning' : undefined} aria-hidden="true" />
            </button>
          </div>
          <div className="companion-model-list">
            {visibleProviders.map((provider) => <section key={provider.instanceId}>
              <h3><ProviderIcon icon={provider.icon} name={provider.name} />{provider.name}</h3>
              {provider.models.map((model) => {
                const selected = selection?.providerInstanceId === provider.instanceId
                  && selection.modelId === model.id;
                return <Dialog.Close asChild key={model.id}>
                  <button
                    type="button"
                    className={selected ? 'is-selected' : undefined}
                    onClick={() => void choose({
                      providerInstanceId: provider.instanceId,
                      modelId: model.id
                    })}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                      <span className="settings-capabilities">
                        {model.isDefault ? <span>Provider default</span> : null}
                        {model.options.map((option) => <span key={option.id}>{option.label}</span>)}
                      </span>
                    </span>
                    {selected ? <Check aria-label="Selected" /> : null}
                  </button>
                </Dialog.Close>;
              })}
            </section>)}
            {!loading && !visibleProviders.length ? <div className="settings-model-empty">
              {normalizedQuery
                ? 'No configured model matches your search.'
                : 'No configured provider returned a verified live model catalog.'}
            </div> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {error ? <span className="companion-model-error" role="status">{error}</span> : null}
  </div>;
}
