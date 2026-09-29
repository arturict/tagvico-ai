'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brain, Check, ChevronDown, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
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
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);

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
      const selected = body.selection || body.defaultSelection || null;
      if (selected?.providerInstanceId) setExpandedProviders([selected.providerInstanceId]);
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
  const reasoningOption = selectedModel?.options.find(
    (option): option is Extract<typeof option, { type: 'select' }> =>
      option.id === 'reasoningEffort' && option.type === 'select'
  );

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
        modelId: persisted.modelId,
        ...(persisted.reasoningEffort ? { reasoningEffort: persisted.reasoningEffort } : {})
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select this model');
    } finally {
      setSaving(false);
    }
  };

  const setReasoningEffort = (reasoningEffort: string) => {
    if (!selection) return;
    void choose({ ...selection, reasoningEffort });
  };

  const toggleProvider = (instanceId: string) => {
    setExpandedProviders((current) => current.includes(instanceId)
      ? current.filter((candidate) => candidate !== instanceId)
      : [...current, instanceId]);
  };

  return <div className="companion-model-control">
    <Dialog.Root onOpenChange={(open) => {
      if (!open) setQuery('');
      if (open && selection?.providerInstanceId) {
        setExpandedProviders((current) => current.includes(selection.providerInstanceId)
          ? current
          : [...current, selection.providerInstanceId]);
      }
    }}>
      <Dialog.Trigger asChild>
        <button
          className="companion-model-trigger"
          type="button"
          disabled={loading || saving || !catalog.providers.length}
          aria-label="Choose Companion model"
          title={selectedProvider ? `${selectedProvider.name} · ${selectedModel?.name || selection?.modelId || ''}` : undefined}
        >
          <ProviderIcon icon={selectedProvider?.icon || null} name={selectedProvider?.name || 'AI provider'} size={16} />
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
            {loading ? <div className="model-catalog-skeleton" aria-label="Loading configured models">
              {Array.from({ length: 5 }, (_, index) => <span key={index}><i /><b /><small /></span>)}
            </div> : null}
            {!loading && visibleProviders.map((provider) => {
              const expanded = Boolean(normalizedQuery) || expandedProviders.includes(provider.instanceId);
              return <section className={`companion-provider-group${expanded ? ' is-expanded' : ''}`} key={provider.instanceId}>
              <button
                type="button"
                className="companion-provider-toggle"
                onClick={() => toggleProvider(provider.instanceId)}
                aria-expanded={expanded}
              >
                <ProviderIcon icon={provider.icon} name={provider.name} />
                <span><strong>{provider.name}</strong><small>{provider.models.length} live model{provider.models.length === 1 ? '' : 's'}</small></span>
                {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              </button>
              {expanded ? <div className="companion-provider-models">{provider.models.map((model) => {
                const selected = selection?.providerInstanceId === provider.instanceId
                  && selection.modelId === model.id;
                const modelReasoning = model.options.find(
                  (option) => option.id === 'reasoningEffort' && option.type === 'select'
                );
                const defaultReasoning = modelReasoning?.type === 'select'
                  ? modelReasoning.defaultValue || modelReasoning.values[0]?.id
                  : undefined;
                return <Dialog.Close asChild key={model.id}>
                  <button
                    type="button"
                    className={selected ? 'is-selected' : undefined}
                    onClick={() => void choose({
                      providerInstanceId: provider.instanceId,
                      modelId: model.id,
                      ...(defaultReasoning ? { reasoningEffort: defaultReasoning } : {})
                    })}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                      <span className="settings-capabilities">
                        {model.isDefault ? <span>Provider default</span> : null}
                        {model.capabilities.includes('tools') ? <span>Tools</span> : null}
                        {model.capabilities.includes('vision') ? <span>Vision</span> : null}
                        {model.capabilities.includes('thinking') ? <span>Thinking</span> : null}
                        {model.options.map((option) => <span key={option.id}>{option.label}</span>)}
                      </span>
                    </span>
                    {selected ? <Check aria-label="Selected" /> : null}
                  </button>
                </Dialog.Close>;
              })}</div> : null}
            </section>;
            })}
            {!loading && !visibleProviders.length ? <div className="settings-model-empty">
              {normalizedQuery
                ? 'No configured model matches your search.'
                : 'No configured provider returned a verified live model catalog.'}
            </div> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {reasoningOption ? <label className="companion-reasoning-control">
      <Brain aria-hidden="true" />
      <span className="sr-only">Thinking effort</span>
      <select
        value={selection?.reasoningEffort || reasoningOption.defaultValue || reasoningOption.values[0]?.id || ''}
        disabled={saving}
        onChange={(event) => setReasoningEffort(event.target.value)}
        title="Thinking effort"
      >
        {reasoningOption.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select>
    </label> : null}
    {error ? <span className="companion-model-error" role="status">{error}</span> : null}
  </div>;
}
