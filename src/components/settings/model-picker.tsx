'use client';

import { useMemo } from 'react';
import { ModelPicker as Picker } from '@/components/model-picker/model-picker';
import type { PickerModel, PickerProvider } from '@/components/model-picker/types';
import type { ModelDescriptor, ProviderDescriptor } from './types';

const isRecommended = (modelId: string) => /(^|\/)gpt-6-luna$/i.test(modelId);

/**
 * The Settings row for the model Tagvico uses for filing and chat: the shared
 * picker, fed with the models of the active provider. Another provider in the
 * rail offers an explicit "Use" button instead of switching on a filter click.
 */
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
  const pickerProviders = useMemo<PickerProvider[]>(() => providers.map((provider) => ({
    id: provider.instanceId,
    name: provider.name,
    icon: provider.icon,
    badge: provider.badge,
    available: provider.available
  })), [providers]);
  const pickerModels = useMemo<PickerModel[]>(() => models.map((model) => ({
    providerId: activeProviderId,
    id: model.id,
    name: model.name,
    badges: [
      isRecommended(model.id) ? 'Recommended' : '',
      model.isDefault ? 'Default' : ''
    ].filter(Boolean)
  })), [activeProviderId, models]);

  return <Picker
    variant="field"
    providers={pickerProviders}
    models={pickerModels}
    selection={activeModelId ? { providerId: activeProviderId, modelId: activeModelId } : null}
    fallbackLabel="Choose a model"
    loading={loading}
    error={error}
    onRefresh={onRefresh}
    onOpen={() => {
      if (!models.length && !loading) void onRefresh();
    }}
    onSelect={(picked) => {
      const model = models.find((candidate) => candidate.id === picked.id);
      if (model) return onSelect(model);
    }}
    providerNote={(provider, modelCount) => {
      const descriptor = providers.find((candidate) => candidate.instanceId === provider.id);
      if (provider.id !== activeProviderId) {
        return <>
          <p>Tagvico uses one provider for filing and chat.</p>
          <button
            type="button"
            className="btn btn-secondary btn-32"
            disabled={provider.available === false}
            onClick={() => void onProviderChange(provider.id)}
          >
            Use {provider.name}
          </button>
        </>;
      }
      if (!modelCount) {
        if (loading || error) return null;
        return <p>{descriptor?.manualModelInput
          ? 'No live models returned. Close this picker and enter a model ID manually.'
          : 'The runtime returned no selectable models.'}</p>;
      }
      return descriptor?.suggestedModels.length
        ? <p>Suggested: {descriptor.suggestedModels.map((suggestion) => suggestion.name).join(', ')}. Not a statement about what your account can use.</p>
        : null;
    }}
  />;
}
