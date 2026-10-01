'use client';
import { ChevronDown } from 'lucide-react';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModelPicker } from '@/components/model-picker/model-picker';
import type { PickerModel, PickerProvider } from '@/components/model-picker/types';
import type {
  CompanionModelProvider,
  CompanionModelSelection
} from '@root/contracts/companion';

/** The provider registry's badge ("New") travels with the catalog when the server sends it. */
type CatalogProvider = CompanionModelProvider & { badge?: string | null };

type Catalog = { providers: CatalogProvider[]; defaultSelection: CompanionModelSelection | null };

type CatalogResponse = Catalog & {
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
  const [catalog, setCatalog] = useState<Catalog>({ providers: [], defaultSelection: null });
  const [selection, setSelection] = useState<CompanionModelSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  const pickerProviders = useMemo<PickerProvider[]>(() => catalog.providers.map((provider) => ({
    id: provider.instanceId,
    name: provider.name,
    icon: provider.icon,
    badge: provider.badge
  })), [catalog.providers]);
  const pickerModels = useMemo<PickerModel[]>(() => catalog.providers.flatMap((provider) => provider.models.map((model) => ({
    providerId: provider.instanceId,
    id: model.id,
    name: model.name,
    ...(model.isDefault ? { badges: ['Default'] } : {})
  }))), [catalog.providers]);
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

  const chooseModel = (picked: PickerModel) => {
    const model = catalog.providers
      .find((provider) => provider.instanceId === picked.providerId)
      ?.models.find((candidate) => candidate.id === picked.id);
    const reasoning = model?.options.find((option) => option.id === 'reasoningEffort' && option.type === 'select');
    const defaultReasoning = reasoning?.type === 'select'
      ? reasoning.defaultValue || reasoning.values[0]?.id
      : undefined;
    return choose({
      providerInstanceId: picked.providerId,
      modelId: picked.id,
      ...(defaultReasoning ? { reasoningEffort: defaultReasoning } : {})
    });
  };

  if (!loading && !catalog.providers.length) {
    return <div className="chat-model-control">
      {error
        ? <button type="button" className="btn btn-secondary btn-32" onClick={() => void load()}>{error} Retry</button>
        : <a className="btn btn-secondary btn-32" href="/settings/providers">Connect an AI model</a>}
    </div>;
  }

  return <div className="chat-model-control">
    <ModelPicker
      providers={pickerProviders}
      models={pickerModels}
      selection={selection ? { providerId: selection.providerInstanceId, modelId: selection.modelId } : null}
      onSelect={chooseModel}
      fallbackLabel={loading ? 'Loading models' : 'Choose a model'}
      // Not disabled while saving: the popover returns focus to this button on close, and a disabled
      // button cannot take it. A second choice during a save simply wins.
      disabled={loading}
      loading={loading}
      onRefresh={() => load(true)}
      globalShortcuts
    />
    {reasoningOption ? <label className="chat-model-reasoning">
      <span className="sr-only">Thinking effort</span>
      <select
        className="chat-model-effort"
        value={selection?.reasoningEffort || reasoningOption.defaultValue || reasoningOption.values[0]?.id || ''}
        disabled={saving}
        onChange={(event) => selection && void choose({ ...selection, reasoningEffort: event.target.value })}
        title="Thinking effort"
      >
        {reasoningOption.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" />
    </label> : null}
    {error ? <span className="chat-model-error field-error" role="status">{error}</span> : null}
  </div>;
}
