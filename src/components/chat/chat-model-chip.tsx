'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { ProviderIcon } from '@/components/provider-icon';
import type {
  CompanionModelCatalog,
  CompanionModelSelection
} from '@root/contracts/companion';

type CatalogResponse = CompanionModelCatalog & {
  selection: CompanionModelSelection | null;
};

export type ModelChipState = 'loading' | 'ready' | 'none' | 'error';

/**
 * The model of this conversation, as a picker at the top left of the chat. The
 * list is the verified catalog of the configured providers; a choice is stored
 * on the conversation and used for the next message.
 */
export function ChatModelChip({
  sessionId,
  onState
}: {
  sessionId: string;
  onState?: (state: ModelChipState) => void;
}) {
  const [catalog, setCatalog] = useState<CompanionModelCatalog>({ providers: [], defaultSelection: null });
  const [selection, setSelection] = useState<CompanionModelSelection | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    onState?.('loading');
    try {
      const response = await fetch(
        `/api/companion/models?sessionId=${encodeURIComponent(sessionId)}${refresh ? '&refresh=1' : ''}`,
        { cache: 'no-store' }
      );
      const body = await response.json().catch(() => ({})) as Partial<CatalogResponse> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load the models');
      const providers = Array.isArray(body.providers) ? body.providers : [];
      const selected = body.selection || body.defaultSelection || null;
      setCatalog({ providers, defaultSelection: body.defaultSelection || null });
      setSelection(selected);
      if (selected?.providerInstanceId) setExpandedProviders([selected.providerInstanceId]);
      onState?.(selected ? 'ready' : 'none');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the models');
      onState?.('error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, onState]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const toggleProvider = (instanceId: string) => {
    setExpandedProviders((current) => current.includes(instanceId)
      ? current.filter((candidate) => candidate !== instanceId)
      : [...current, instanceId]);
  };

  if (!loading && !catalog.providers.length) {
    return <div className="chat-model-control">
      {error
        ? <button type="button" className="btn btn-secondary btn-32" onClick={() => void load()}>{error} Retry</button>
        : <a className="btn btn-secondary btn-32" href="/settings/providers">Connect an AI model</a>}
    </div>;
  }

  return <div className="chat-model-control">
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
          className="btn btn-ghost chat-model-trigger"
          type="button"
          disabled={loading || saving}
          aria-label="Choose model"
          title={selectedProvider ? `${selectedProvider.name} · ${selectedModel?.name || selection?.modelId || ''}` : undefined}
        >
          <span>{selectedModel?.name || selection?.modelId || (loading ? 'Loading models' : 'Choose a model')}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog chat-model-dialog" aria-describedby="chat-model-description">
          <header className="chat-model-dialog-head">
            <div>
              <Dialog.Title className="type-section">Model</Dialog.Title>
              <Dialog.Description id="chat-model-description" className="meta">
                Used for the next message in this chat.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn btn-ghost btn-icon btn-32" aria-label="Close model picker">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="chat-model-toolbar">
            <label className="chat-model-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search models</span>
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                autoFocus
              />
            </label>
            <button
              className="btn btn-ghost btn-icon"
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              aria-label="Refresh models"
            >
              <RefreshCw className={loading ? 'chat-spin' : undefined} aria-hidden="true" />
            </button>
          </div>
          <div className="chat-model-list">
            {loading ? <p className="chat-model-empty shimmer">Loading models</p> : null}
            {!loading && visibleProviders.map((provider) => {
              const expanded = Boolean(normalizedQuery) || expandedProviders.includes(provider.instanceId);
              return <section className="chat-model-group" key={provider.instanceId}>
                <button
                  type="button"
                  className="chat-model-provider"
                  onClick={() => toggleProvider(provider.instanceId)}
                  aria-expanded={expanded}
                >
                  <ProviderIcon icon={provider.icon} name={provider.name} />
                  <span><strong>{provider.name}</strong><small>{provider.models.length} model{provider.models.length === 1 ? '' : 's'}</small></span>
                  {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                </button>
                {expanded ? <div className="chat-model-options">{provider.models.map((model) => {
                  const selected = selection?.providerInstanceId === provider.instanceId
                    && selection.modelId === model.id;
                  const modelReasoning = model.options.find(
                    (option) => option.id === 'reasoningEffort' && option.type === 'select'
                  );
                  const defaultReasoning = modelReasoning?.type === 'select'
                    ? modelReasoning.defaultValue || modelReasoning.values[0]?.id
                    : undefined;
                  const traits = [
                    model.isDefault ? 'Default' : '',
                    model.capabilities.includes('tools') ? 'Tools' : '',
                    model.capabilities.includes('vision') ? 'Vision' : '',
                    model.capabilities.includes('thinking') ? 'Thinking' : ''
                  ].filter(Boolean);
                  return <Dialog.Close asChild key={model.id}>
                    <button
                      type="button"
                      className={`chat-model-option${selected ? ' is-selected' : ''}`}
                      onClick={() => void choose({
                        providerInstanceId: provider.instanceId,
                        modelId: model.id,
                        ...(defaultReasoning ? { reasoningEffort: defaultReasoning } : {})
                      })}
                    >
                      <span>
                        <strong>{model.name}</strong>
                        <small>{model.id}</small>
                        {traits.length ? <em>{traits.join(' · ')}</em> : null}
                      </span>
                      {selected ? <Check aria-label="Selected" /> : null}
                    </button>
                  </Dialog.Close>;
                })}</div> : null}
              </section>;
            })}
            {!loading && !visibleProviders.length ? <p className="chat-model-empty">
              {normalizedQuery ? 'No model matches your search.' : 'No connected provider listed a model.'}
            </p> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {reasoningOption ? <label className="chat-model-reasoning">
      <span className="sr-only">Thinking effort</span>
      <select
        className="select select-32"
        value={selection?.reasoningEffort || reasoningOption.defaultValue || reasoningOption.values[0]?.id || ''}
        disabled={saving}
        onChange={(event) => selection && void choose({ ...selection, reasoningEffort: event.target.value })}
        title="Thinking effort"
      >
        {reasoningOption.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select>
    </label> : null}
    {error ? <span className="chat-model-error field-error" role="status">{error}</span> : null}
  </div>;
}
