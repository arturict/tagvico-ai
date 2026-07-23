'use client';

import { Check, GitMerge, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { InlineStatus } from './inline-status';
import type {
  ModelDescriptor,
  ProviderDescriptor,
  TagUnificationSuggestion
} from './types';

type ProviderOption = {
  instanceId: string;
  name: string;
  discovery: string;
};
type AuditEntry = {
  id: string;
  phase: string;
  action: string;
  documentId?: number | null;
  outcome: string;
  createdAt: string;
  error?: string | null;
};
type SelectOption = Extract<ModelDescriptor['options'][number], { type: 'select' }>;

function modelReasoningOption(model?: ModelDescriptor): SelectOption | undefined {
  return model?.options.find(
    (option): option is SelectOption => option.id === 'reasoningEffort' && option.type === 'select'
  );
}

export function TagUnification({
  providers,
  activeProviderId,
  activeModelId
}: {
  providers: ProviderDescriptor[];
  activeProviderId: string;
  activeModelId: string;
}) {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [providerId, setProviderId] = useState(activeProviderId);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [modelId, setModelId] = useState(activeModelId);
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [suggestions, setSuggestions] = useState<TagUnificationSuggestion[]>([]);
  const [auditBySuggestion, setAuditBySuggestion] = useState<Record<string, AuditEntry[]>>({});
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<{ kind: 'neutral' | 'loading' | 'success' | 'error'; message: string } | null>(null);

  const loadModels = async (nextProviderId: string) => {
    setModels([]);
    setModelId('');
    setReasoningEffort('');
    if (!nextProviderId) return;
    setBusy('models');
    setStatus({ kind: 'loading', message: 'Loading the provider live catalog…' });
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(nextProviderId)}/models`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load provider models.');
      const nextModels = Array.isArray(body.models) ? body.models as ModelDescriptor[] : [];
      setModels(nextModels);
      const preferred = nextModels.find((model) => model.id === activeModelId)
        || nextModels.find((model) => model.isDefault)
        || nextModels[0];
      setModelId(preferred?.id || '');
      const effort = modelReasoningOption(preferred);
      setReasoningEffort(effort?.defaultValue || effort?.values[0]?.id || '');
      setStatus(nextModels.length
        ? { kind: 'success', message: `${nextModels.length} live model${nextModels.length === 1 ? '' : 's'} available.` }
        : { kind: 'neutral', message: 'This provider returned no live models.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load provider models.' });
    } finally {
      setBusy('');
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    try {
      const response = await fetch('/api/tag-unification', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load tag-unification suggestions.');
      const nextProviders = Array.isArray(body.providers) ? body.providers as ProviderOption[] : [];
      setProviderOptions(nextProviders);
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
      const preferredProvider = nextProviders.some((provider) => provider.instanceId === providerId)
        ? providerId
        : nextProviders.some((provider) => provider.instanceId === activeProviderId)
          ? activeProviderId
          : nextProviders[0]?.instanceId || '';
      if (preferredProvider && preferredProvider !== providerId) setProviderId(preferredProvider);
      if (preferredProvider && !models.length) await loadModels(preferredProvider);
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load tag unification.' });
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selectedModel = models.find((model) => model.id === modelId);
  const effortOption = modelReasoningOption(selectedModel);
  const providerName = providers.find((provider) => provider.instanceId === providerId)?.name
    || providerOptions.find((provider) => provider.instanceId === providerId)?.name
    || providerId;

  const analyze = async () => {
    if (!providerId || !modelId) return;
    setBusy('analyze');
    setStatus({ kind: 'loading', message: 'Reading all Paperless tags and asking the selected model for conservative suggestions…' });
    try {
      const response = await fetch('/api/tag-unification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerInstanceId: providerId,
          modelId,
          ...(reasoningEffort ? { reasoningEffort } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Tag analysis failed.');
      setSuggestions((current) => [...(body.suggestions || []), ...current]);
      setStatus({
        kind: 'success',
        message: `${body.tagsAnalyzed} tags analyzed. ${body.suggestions?.length || 0} suggestion${body.suggestions?.length === 1 ? '' : 's'} need review.`
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Tag analysis failed.' });
    } finally {
      setBusy('');
    }
  };

  const mutateSuggestion = async (
    suggestion: TagUnificationSuggestion,
    endpoint: 'decision' | 'execute',
    payload: Record<string, string>
  ) => {
    setBusy(suggestion.id);
    try {
      const response = await fetch(`/api/tag-unification/${encodeURIComponent(suggestion.id)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update this suggestion.');
      const updated = body.suggestion || body;
      setSuggestions((current) => current.map((item) => item.id === suggestion.id ? updated : item));
      setStatus({
        kind: 'success',
        message: endpoint === 'decision'
          ? `Suggestion ${payload.decision}.`
          : payload.phase === 'move'
            ? 'Phase 1 complete. The source tag is now unused; deletion still requires a separate click.'
            : 'Phase 2 complete. The unused source tag was deleted.'
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update this suggestion.' });
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const loadAudit = async (suggestion: TagUnificationSuggestion) => {
    if (auditBySuggestion[suggestion.id]) {
      setAuditBySuggestion((current) => {
        const next = { ...current };
        delete next[suggestion.id];
        return next;
      });
      return;
    }
    setBusy(`audit-${suggestion.id}`);
    try {
      const response = await fetch(`/api/tag-unification/${encodeURIComponent(suggestion.id)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load the audit trail.');
      setAuditBySuggestion((current) => ({ ...current, [suggestion.id]: body.audit || [] }));
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load the audit trail.' });
    } finally {
      setBusy('');
    }
  };

  return <div className="tag-unification">
    <div className="tag-unification-controls">
      <label className="settings-field">
        <span className="settings-field-label">Configured provider</span>
        <select
          className="settings-select"
          value={providerId}
          onChange={(event) => {
            const next = event.target.value;
            setProviderId(next);
            void loadModels(next);
          }}
        >
          {!providerOptions.length ? <option value="">No configured runtime</option> : null}
          {providerOptions.map((provider) => <option key={provider.instanceId} value={provider.instanceId}>
            {provider.name}
          </option>)}
        </select>
      </label>
      <label className="settings-field">
        <span className="settings-field-label">Live model</span>
        <select
          className="settings-select"
          value={modelId}
          disabled={!models.length}
          onChange={(event) => {
            const nextModelId = event.target.value;
            setModelId(nextModelId);
            const nextModel = models.find((model) => model.id === nextModelId);
            const nextEffort = modelReasoningOption(nextModel);
            setReasoningEffort(nextEffort?.defaultValue || nextEffort?.values[0]?.id || '');
          }}
        >
          {!models.length ? <option value="">Load a live catalog first</option> : null}
          {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
      </label>
      {effortOption ? <label className="settings-field">
        <span className="settings-field-label">Thinking effort</span>
        <select
          className="settings-select"
          value={reasoningEffort}
          onChange={(event) => setReasoningEffort(event.target.value)}
        >
          {effortOption.values.map((effort) => <option key={effort.id} value={effort.id}>{effort.label}</option>)}
        </select>
      </label> : null}
    </div>
    <div className="settings-action-cluster tag-unification-actions">
      <button
        className="settings-button is-primary"
        type="button"
        disabled={!modelId || Boolean(busy)}
        onClick={() => void analyze()}
      >
        {busy === 'analyze' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <GitMerge aria-hidden="true" />}
        Analyze all tags
      </button>
      <button
        className="settings-button"
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void loadModels(providerId)}
      >
        <RefreshCw className={busy === 'models' ? 'is-spinning' : undefined} aria-hidden="true" />
        Refresh models
      </button>
      <span className="settings-badge">{providerName || 'No provider selected'}</span>
    </div>
    {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : null}
    <p className="tag-unification-safety">
      Analysis never changes Paperless. Every pair needs approval. Moving documents and deleting the unused source tag are always two separate calls.
    </p>
    <div className="tag-unification-list">
      {suggestions.map((suggestion) => <article className={`tag-unification-card is-${suggestion.status}`} key={suggestion.id}>
        <header>
          <div>
            <span className="tag-unification-pair">
              <strong>{suggestion.sourceTagName}</strong>
              <span aria-hidden="true">→</span>
              <strong>{suggestion.targetTagName}</strong>
            </span>
            <small>
              {suggestion.sourceDocumentCount} source documents · {Math.round(suggestion.confidence * 100)}% confidence · {suggestion.modelId}
            </small>
          </div>
          <span className="settings-badge">{suggestion.status}</span>
        </header>
        <div className="tag-unification-reason">
          <MessageResponse>{suggestion.reason}</MessageResponse>
        </div>
        {suggestion.lastError ? <InlineStatus kind="error">{suggestion.lastError}</InlineStatus> : null}
        <footer>
          {suggestion.status === 'suggested' ? <>
            <button
              className="settings-button is-primary"
              type="button"
              disabled={busy === suggestion.id}
              onClick={() => void mutateSuggestion(suggestion, 'decision', { decision: 'approved' })}
            >
              <Check aria-hidden="true" /> Approve
            </button>
            <button
              className="settings-button"
              type="button"
              disabled={busy === suggestion.id}
              onClick={() => void mutateSuggestion(suggestion, 'decision', { decision: 'rejected' })}
            >
              <X aria-hidden="true" /> Reject
            </button>
          </> : null}
          {(suggestion.status === 'approved' || (suggestion.status === 'failed' && suggestion.currentPhase === 'move')) ? <button
            className="settings-button is-primary"
            type="button"
            disabled={busy === suggestion.id}
            onClick={() => void mutateSuggestion(suggestion, 'execute', { phase: 'move' })}
          >
            <GitMerge aria-hidden="true" /> {suggestion.status === 'failed' ? 'Retry phase 1' : 'Phase 1 · Move documents'}
          </button> : null}
          {(suggestion.status === 'moved' || (suggestion.status === 'failed' && suggestion.currentPhase === 'delete')) ? <button
            className="settings-button tag-unification-delete"
            type="button"
            disabled={busy === suggestion.id}
            onClick={() => void mutateSuggestion(suggestion, 'execute', { phase: 'delete' })}
          >
            <Trash2 aria-hidden="true" /> {suggestion.status === 'failed' ? 'Retry phase 2' : 'Phase 2 · Delete unused source'}
          </button> : null}
          <button className="settings-button" type="button" onClick={() => void loadAudit(suggestion)}>
            {auditBySuggestion[suggestion.id] ? 'Hide audit' : 'View audit'}
          </button>
        </footer>
        {auditBySuggestion[suggestion.id] ? <ol className="tag-unification-audit">
          {auditBySuggestion[suggestion.id].length ? auditBySuggestion[suggestion.id].map((entry) => <li key={entry.id}>
            <span>{entry.phase} · {entry.action}{entry.documentId ? ` · document ${entry.documentId}` : ''}</span>
            <small>{entry.outcome} · {new Date(entry.createdAt).toLocaleString()}</small>
          </li>) : <li><span>No execution events yet.</span></li>}
        </ol> : null}
      </article>)}
      {!suggestions.length && busy !== 'refresh' ? <div className="settings-model-empty">
        No tag-unification suggestions yet. Choose a live model and run a read-only analysis.
      </div> : null}
    </div>
  </div>;
}
