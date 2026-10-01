'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  FileStack,
  SlidersHorizontal,
  Tags,
  UsersRound
} from 'lucide-react';
import { DraftField } from './draft-field';
import { DraftTextarea } from './draft-textarea';
import { ChannelSettings } from './channel-settings';
import { ChatGPTPlanSignIn } from './chatgpt-plan-sign-in';
import { CustomFieldsEditor } from './custom-fields-editor';
import { HouseholdSettings, type HouseholdMember } from './household-settings';
import { InlineStatus } from './inline-status';
import { MfaSettings } from './mfa-settings';
import { ModelPicker } from './model-picker';
import { PaperlessConnection } from './paperless-connection';
import { PaperlessDiscovery } from './paperless-discovery';
import { idleAuth, providerAuthFromStatus, type ProviderAuth } from './provider-auth';
import { ProviderPicker } from './provider-picker';
import { settingsSectionTitles } from './sections';
import { SettingSwitch } from './setting-switch';
import { SettingsRow, SettingsSection } from './settings-section';
import { TagGroupCard } from './tag-group-card';
import type {
  ChannelId,
  ChannelSettingsView,
  ModelDescriptor,
  SettingsResponse,
  SettingsSectionId,
  TagGroup
} from './types';

const sections = [
  { id: 'paperless', Icon: FileStack },
  { id: 'providers', Icon: Bot },
  { id: 'automation', Icon: SlidersHorizontal },
  { id: 'tags', Icon: Tags },
  { id: 'people', Icon: UsersRound }
] as const;

const descriptions: Record<SettingsSectionId, string> = {
  paperless: 'The source of documents, permissions and filing vocabulary.',
  providers: 'Sign in with ChatGPT or connect another provider, then choose the model.',
  automation: 'Control when Tagvico processes documents and which execution mode it uses.',
  tags: 'Control the vocabulary, clean up duplicates and define safe metadata boundaries.',
  people: 'Household profiles, Paperless access, sign-in protection and outbound access.'
};

/** Provider errors can carry a pasted JSON body; show only the readable first line. */
const plainError = (message: string) => message.split('\n')[0].replace(/:\s*[{[].*$/, '').slice(0, 220);

/** The recommended default for filing; shown as such wherever a provider offers it. */
const isRecommendedModel = (modelId: string) => /(^|\/)gpt-6-luna$/i.test(modelId);


type HouseholdProps = {
  currentMemberId: string;
  currentRole: string;
  householdKind: string;
  members: HouseholdMember[];
};

type Toast = { kind: 'success' | 'error'; message: string } | null;

/** Flattens a patch into the dotted field paths the API reports validation errors for. */
function patchedFields(patch: Record<string, unknown>): string[] {
  return Object.entries(patch).flatMap(([group, value]) => {
    if (!value || typeof value !== 'object') return [group];
    if (group === 'provider') {
      const values = (value as { values?: Record<string, unknown> }).values || {};
      return Object.keys(values).map((key) => `provider.${key}`);
    }
    return Object.keys(value).map((key) => `${group}.${key}`);
  });
}

class FieldError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export function SettingsWorkspace({
  section,
  initialSettings,
  channels,
  household
}: {
  section: SettingsSectionId;
  initialSettings: SettingsResponse;
  channels: Record<ChannelId, ChannelSettingsView> | null;
  household: HouseholdProps;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const settingsRef = useRef(initialSettings);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const providerSelectionId = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const codexPollTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelDescriptor[]>>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [probeStatus, setProbeStatus] = useState('');
  const [configuredProviderId, setConfiguredProviderId] = useState(initialSettings.ai.activeProviderInstanceId);
  const [codexLogin, setCodexLogin] = useState('');
  const [codexLoginOutput, setCodexLoginOutput] = useState('');
  const [copilotLogin, setCopilotLogin] = useState('');
  const [copilotChallenge, setCopilotChallenge] = useState<{ verificationUrl?: string; userCode?: string }>({});
  const [authByProvider, setAuthByProvider] = useState<Record<string, ProviderAuth>>({});
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [newTagGroupName, setNewTagGroupName] = useState('');

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
  }, []);

  const showMessage = (kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const errorFor = (field: string) => fieldErrors[field];

  const applyPatch = (patch: Record<string, unknown>, successMessage = 'Settings saved.') => {
    const operation = mutationQueue.current.then(async () => {
      const response = await fetch('/api/settings/v3', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: settingsRef.current.revision, patch })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          const fresh = await fetch('/api/settings/v3', { cache: 'no-store' }).then((result) => result.json());
          settingsRef.current = fresh;
          setSettings(fresh);
        }
        throw new FieldError(body.error || 'Could not save settings.', body.field);
      }
      settingsRef.current = body;
      setSettings(body);
      setFieldErrors((current) => {
        const next = { ...current };
        for (const field of patchedFields(patch)) delete next[field];
        return next;
      });
      if (body?.automation?.writeMode) {
        window.dispatchEvent(new CustomEvent('tagvico:write-mode', {
          detail: { writeMode: body.automation.writeMode }
        }));
      }
      showMessage('success', successMessage);
      return body as SettingsResponse;
    });
    const handledOperation = operation.catch((error) => {
      const message = error instanceof Error ? error.message : 'Could not save settings.';
      const field = error instanceof FieldError ? error.field : undefined;
      // A value that belongs to one input is explained next to it; the rest go to the toast.
      // Choosing a provider has no input of its own, so that one is always a toast.
      const inline = field && !field.startsWith('ai.activeProvider') && patchedFields(patch).includes(field);
      if (field && inline) setFieldErrors((current) => ({ ...current, [field]: message }));
      else showMessage('error', message);
      return null;
    });
    mutationQueue.current = handledOperation;
    return handledOperation;
  };

  const activeProvider = settings.ai.providers.find(
    (provider) => provider.instanceId === settings.ai.activeProviderInstanceId
  );
  const configuredProvider = settings.ai.providers.find(
    (provider) => provider.instanceId === configuredProviderId
  ) || activeProvider;
  const activeModels = modelsByProvider[settings.ai.activeProviderInstanceId] || [];
  const activeModel = activeModels.find((model) => model.id === settings.ai.activeModelId);
  const recommendedModel = activeModels.find((model) => isRecommendedModel(model.id));
  const providerAuth = authByProvider[configuredProviderId] || idleAuth;
  const chatgptAuth = authByProvider.chatgpt || idleAuth;
  const chatgptProvider = settings.ai.providers.find((provider) => provider.instanceId === 'chatgpt');

  const loadModels = async (instanceId = settingsRef.current.ai.activeProviderInstanceId) => {
    setModelsLoading(true);
    setModelsError('');
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(instanceId)}/models`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load models.');
      const models = (body.models || []) as ModelDescriptor[];
      setModelsByProvider((current) => ({ ...current, [instanceId]: models }));
      return models;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load models.';
      setModelsError(message);
      return [];
    } finally {
      setModelsLoading(false);
    }
  };

  const selectProvider = async (instanceId: string) => {
    const selectionId = ++providerSelectionId.current;
    if (['chatgpt', 'codex', 'copilot'].includes(instanceId)) {
      const models = await loadModels(instanceId);
      if (selectionId !== providerSelectionId.current) return;
      // Keep the model already chosen for this provider; otherwise start with the
      // lightest recommended tier (GPT-6 Luna) before the runtime's own default.
      const keepCurrent = settingsRef.current.ai.activeProviderInstanceId === instanceId;
      const selectedModel = (keepCurrent ? models.find((model) => model.id === settingsRef.current.ai.activeModelId) : undefined)
        || models.find((model) => isRecommendedModel(model.id))
        || models.find((model) => model.isDefault)
        || models[0];
      if (!selectedModel) {
        showMessage('error', 'Connect this account and load an available model before selecting it.');
        return;
      }
      const defaults = Object.fromEntries(selectedModel.options.map((option) => [
        option.id,
        option.defaultValue ?? (option.type === 'select' ? option.values[0]?.id : false)
      ]));
      await applyPatch({
        ai: {
          activeProviderInstanceId: instanceId,
          activeModelId: selectedModel.id,
          ...(Object.keys(defaults).length ? { modelOptions: defaults } : {})
        }
      }, `${selectedModel.name} selected.`);
      return;
    }
    const saved = await applyPatch({ ai: { activeProviderInstanceId: instanceId } }, 'Provider selected.');
    if (saved) await loadModels(instanceId);
  };

  const selectModel = async (model: ModelDescriptor) => {
    const defaults = Object.fromEntries(model.options.map((option) => [
      option.id,
      option.defaultValue ?? (option.type === 'select' ? option.values[0]?.id : false)
    ]));
    await applyPatch({
      ai: {
        activeModelId: model.id,
        ...(Object.keys(defaults).length ? { modelOptions: defaults } : {})
      }
    }, `${model.name} selected.`);
  };

  const probeProvider = async (instanceId = configuredProviderId) => {
    setProbeStatus('Checking connection…');
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(instanceId)}/probe`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Provider probe failed.');
      setProbeStatus(`Connected in ${body.latencyMs} ms · ${body.models} live models`);
      const providerName = settingsRef.current.ai.providers.find((provider) => provider.instanceId === instanceId)?.name;
      showMessage('success', `${providerName || instanceId} is reachable.`);
    } catch (error) {
      const message = plainError(error instanceof Error ? error.message : 'Provider probe failed.');
      setProbeStatus(message);
      showMessage('error', message);
    }
  };

  const pollCodexLogin = (loginId: string) => {
    if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
    const deadline = Date.now() + 5 * 60 * 1000;
    codexPollTimer.current = window.setInterval(async () => {
      if (Date.now() > deadline) {
        if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
        setCodexLogin('');
        showMessage('error', 'ChatGPT sign-in timed out.');
        return;
      }
      try {
        const response = await fetch(`/api/codex/login/${encodeURIComponent(loginId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not check ChatGPT sign-in.');
        setCodexLoginOutput(body.output || body.error || 'Waiting for sign-in…');
        if (body.completed) {
          if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
          setCodexLogin('');
          if (body.error) throw new Error(body.error);
          showMessage('success', 'ChatGPT sign-in completed.');
          await loadProviderAuth('codex');
          await loadModels('codex');
        }
      } catch (error) {
        if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
        setCodexLogin('');
        showMessage('error', error instanceof Error ? error.message : 'Could not complete ChatGPT sign-in.');
      }
    }, 1200);
  };

  const startCodexLogin = async () => {
    try {
      const response = await fetch('/api/codex/login', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not start ChatGPT sign-in.');
      setCodexLogin(body.loginId);
      setCodexLoginOutput(body.output || 'Starting secure device sign-in…');
      pollCodexLogin(body.loginId);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not start ChatGPT sign-in.');
    }
  };

  const loadProviderAuth = async (providerId = settingsRef.current.ai.activeProviderInstanceId) => {
    const setAuth = (next: ProviderAuth | ((current: ProviderAuth) => ProviderAuth)) => {
      setAuthByProvider((current) => ({
        ...current,
        [providerId]: typeof next === 'function' ? next(current[providerId] || idleAuth) : next
      }));
    };
    if (!['chatgpt', 'codex', 'copilot'].includes(providerId)) {
      setAuth(idleAuth);
      return;
    }
    setAuth((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch(`/api/${providerId}/status`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      setAuth(providerAuthFromStatus(providerId, body));
    } catch {
      setAuth({ loading: false, authenticated: false, label: 'Status unavailable' });
    }
  };

  const startCopilotLogin = async () => {
    try {
      const response = await fetch('/api/copilot/login', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not start GitHub Copilot sign-in.');
      setCopilotLogin(body.loginId);
      setCopilotChallenge({ verificationUrl: body.verificationUrl, userCode: body.userCode });
      if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
      codexPollTimer.current = window.setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/copilot/login/${encodeURIComponent(body.loginId)}`, { cache: 'no-store' });
          const status = await statusResponse.json().catch(() => ({}));
          if (!status.completed) return;
          if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
          codexPollTimer.current = null;
          setCopilotLogin('');
          setCopilotChallenge({});
          await loadProviderAuth('copilot');
          await loadModels('copilot');
          if (status.success) showMessage('success', 'GitHub Copilot connected.');
          else showMessage('error', status.error || 'GitHub Copilot sign-in failed.');
        } catch {
          // Keep polling through transient network errors while the device flow is active.
        }
      }, 1500);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not start GitHub Copilot sign-in.');
    }
  };

  const logoutProvider = async (providerId: 'chatgpt' | 'codex' | 'copilot') => {
    try {
      const response = await fetch(`/api/${providerId}/logout`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not sign out.');
      await loadProviderAuth(providerId);
      if (providerId === 'chatgpt' && body.revoked === false) {
        showMessage('error', 'Signed out locally, but ChatGPT did not confirm the disconnect. Remove Tagvico under ChatGPT Settings.');
        return;
      }
      showMessage('success', `${providerId === 'copilot' ? 'GitHub Copilot' : 'ChatGPT'} signed out.`);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const updateTagGroup = async (nextGroup: TagGroup) => {
    const groups = settingsRef.current.tags.groups.map((group) => group.id === nextGroup.id ? nextGroup : group);
    await applyPatch({ tags: { groups } }, `${nextGroup.name} updated.`);
  };

  const addTagGroup = async () => {
    const name = newTagGroupName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const baseId = name.toLocaleLowerCase('en-US')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom';
    const ids = new Set(settingsRef.current.tags.groups.map((group) => group.id));
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) id = `${baseId}-${suffix++}`;
    const groups = [...settingsRef.current.tags.groups, { id, name, enabled: true, tags: [] }];
    const saved = await applyPatch({ tags: { groups } }, `${name} created.`);
    if (saved) setNewTagGroupName('');
  };

  const deleteTagGroup = async (groupToDelete: TagGroup) => {
    if (groupToDelete.preset || groupToDelete.permanent) return;
    const groups = settingsRef.current.tags.groups.filter((group) => group.id !== groupToDelete.id);
    await applyPatch({ tags: { groups } }, `${groupToDelete.name} deleted.`);
  };

  const duplicateTagsByGroup = (() => {
    const owners = new Map<string, Set<string>>();
    for (const group of settings.tags.groups) {
      for (const tag of group.tags) {
        const key = tag.trim().toLocaleLowerCase('en-US');
        if (!key) continue;
        const groupIds = owners.get(key) || new Set<string>();
        groupIds.add(group.id);
        owners.set(key, groupIds);
      }
    }
    return Object.fromEntries(settings.tags.groups.map((group) => [
      group.id,
      group.tags.filter((tag) => (owners.get(tag.trim().toLocaleLowerCase('en-US'))?.size || 0) > 1)
    ]));
  })();

  useEffect(() => {
    void loadProviderAuth(configuredProviderId);
    setProbeStatus('');
    // Authentication is shown for the provider currently being configured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredProviderId]);

  useEffect(() => {
    if (section !== 'providers') return;
    // The ChatGPT hero shows its sign-in state whichever provider is open below it.
    if (initialSettings.ai.activeProviderInstanceId !== 'chatgpt') void loadProviderAuth('chatgpt');
    // The active model's options (thinking effort) come from the live catalog.
    void loadModels(initialSettings.ai.activeProviderInstanceId);
    // Runs once when the AI models section opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = (() => {
    if (section === 'paperless') {
      return <>
        <SettingsSection title="Paperless connection" description="The token is write-only. Every save checks the connection with Paperless.">
          <PaperlessConnection paperless={settings.paperless} applyPatch={applyPatch} errorFor={errorFor} />
        </SettingsSection>
        <SettingsSection
          title="Instance discovery"
          description="Scan common Docker, host and local-network addresses without changing your saved connection."
        >
          <SettingsRow
            title="Find Paperless-ngx"
            description="This is read-only discovery. Found URLs are shown for comparison and are never saved automatically."
            stack
          >
            <PaperlessDiscovery baseUrl={settings.paperless.baseUrl} />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="System info" description="A redacted view of this installation. It contains no tokens, account IDs or private credential values.">
          <dl className="settings-diagnostics">
            <div><dt>Tagvico version</dt><dd>{settings.diagnostics.version}</dd></div>
            <div><dt>Setup complete</dt><dd>{settings.diagnostics.configured ? 'Yes' : 'No'}</dd></div>
            <div><dt>Provider definitions</dt><dd>{settings.diagnostics.providerRegistrySize}</dd></div>
            <div><dt>Active provider</dt><dd>{settings.ai.activeProviderInstanceId}</dd></div>
            <div><dt>Active model</dt><dd>{settings.ai.activeModelId || 'Not configured'}</dd></div>
            <div><dt>Settings revision</dt><dd><code>{settings.revision}</code></dd></div>
          </dl>
        </SettingsSection>
      </>;
    }
    if (section === 'providers') {
      const configuredIsHero = configuredProvider?.instanceId === 'chatgpt';
      const probeCluster = (provider: { instanceId: string; name: string }, extra?: ReactNode) => <div className="settings-action-cluster">
        <button
          className="settings-button"
          type="button"
          onClick={() => {
            setConfiguredProviderId(provider.instanceId);
            void probeProvider(provider.instanceId);
          }}
        >
          Test {provider.name}
        </button>
        {extra}
        {probeStatus && configuredProvider?.instanceId === provider.instanceId
          ? <InlineStatus kind={probeStatus.startsWith('Connected') ? 'success' : probeStatus.includes('…') ? 'loading' : 'error'}>{probeStatus}</InlineStatus>
          : null}
      </div>;
      return <>
        <SettingsSection
          title="AI provider"
          description="Tagvico uses one provider for filing and Ask Tagvico. Secrets are write-only and are never sent back to this browser."
        >
          <div className="provider-panel">
            <ProviderPicker
              providers={settings.ai.providers}
              selectedId={configuredProvider?.instanceId || ''}
              activeId={settings.ai.activeProviderInstanceId}
              onSelect={setConfiguredProviderId}
              heroAction={<>
                <ChatGPTPlanSignIn
                  apiBase="/api/chatgpt"
                  authenticated={chatgptAuth.authenticated}
                  accountLabel={chatgptAuth.label}
                  onConnected={async () => {
                    const firstConnection = !chatgptAuth.authenticated;
                    showMessage('success', 'ChatGPT plan connected.');
                    setConfiguredProviderId('chatgpt');
                    await loadProviderAuth('chatgpt');
                    if (firstConnection && settingsRef.current.ai.activeProviderInstanceId !== 'chatgpt') {
                      await selectProvider('chatgpt');
                    } else {
                      await loadModels('chatgpt');
                    }
                  }}
                  onError={(message) => showMessage('error', message)}
                  onLogout={() => logoutProvider('chatgpt')}
                />
                {chatgptAuth.authenticated && settings.ai.activeProviderInstanceId !== 'chatgpt' ? <div className="settings-action-cluster">
                  <button className="settings-button" type="button" onClick={() => void selectProvider('chatgpt')}>
                    Use ChatGPT plan for Tagvico
                  </button>
                </div> : null}
                {chatgptProvider && chatgptAuth.authenticated ? probeCluster(chatgptProvider) : null}
              </>}
            />
          </div>
          {configuredProvider && !configuredIsHero ? <SettingsRow
            title={`${configuredProvider.name} configuration`}
            description={configuredProvider.description}
            stack
          >
            {configuredProvider.fields.length ? <div className="settings-fields-grid">
              {configuredProvider.fields.map((field) => {
                const stored = configuredProvider.configuration[field.key];
                return <DraftField
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  type={field.type}
                  value={typeof stored === 'string' ? stored : ''}
                  configured={typeof stored === 'object' && stored.configured}
                  placeholder={field.placeholder}
                  error={errorFor(`provider.${field.key}`)}
                  onCommit={async (value) => {
                    const saved = await applyPatch({
                      provider: { instanceId: configuredProvider.instanceId, values: { [field.key]: value } }
                    }, `${field.label} saved.`);
                    if (saved) {
                      setModelsByProvider((current) => {
                        const next = { ...current };
                        delete next[configuredProvider.instanceId];
                        return next;
                      });
                    }
                  }}
                />;
              })}
            </div> : <InlineStatus kind="neutral">This runtime uses account authentication instead of an API-key field.</InlineStatus>}
            {configuredProvider.instanceId === 'codex' ? <div className="settings-auth-panel">
              <div className="settings-action-cluster">
                <InlineStatus kind={providerAuth.loading ? 'loading' : providerAuth.authenticated ? 'success' : 'neutral'}>
                  {providerAuth.loading ? 'Checking account…' : providerAuth.label}
                </InlineStatus>
                <button className="settings-button" type="button" disabled={Boolean(codexLogin)} onClick={() => void startCodexLogin()}>
                  {codexLogin ? 'Waiting for sign-in…' : providerAuth.authenticated ? 'Reconnect ChatGPT' : 'Sign in with ChatGPT'}
                </button>
                {providerAuth.authenticated
                  ? <button className="settings-button is-danger" type="button" onClick={() => void logoutProvider('codex')}>Sign out</button>
                  : null}
              </div>
              {codexLoginOutput ? <pre className="settings-auth-output">{codexLoginOutput}</pre> : null}
            </div> : null}
            {configuredProvider.instanceId === 'copilot' ? <div className="settings-auth-panel">
              <div className="settings-action-cluster">
                <InlineStatus kind={providerAuth.loading ? 'loading' : providerAuth.authenticated ? 'success' : 'neutral'}>
                  {providerAuth.loading ? 'Checking account…' : providerAuth.label}
                </InlineStatus>
                <button className="settings-button" type="button" disabled={Boolean(copilotLogin)} onClick={() => void startCopilotLogin()}>
                  {copilotLogin ? 'Waiting for sign-in…' : providerAuth.authenticated ? 'Reconnect Copilot' : 'Sign in with GitHub'}
                </button>
                {providerAuth.authenticated
                  ? <button className="settings-button is-danger" type="button" onClick={() => void logoutProvider('copilot')}>Sign out</button>
                  : null}
              </div>
              {copilotChallenge.verificationUrl ? <div className="settings-auth-challenge">
                <span>Code <strong>{copilotChallenge.userCode}</strong></span>
                <a href={copilotChallenge.verificationUrl} target="_blank" rel="noreferrer">Open GitHub device sign-in</a>
              </div> : null}
            </div> : null}
            {probeCluster(configuredProvider, configuredProvider.instanceId !== settings.ai.activeProviderInstanceId ? <button
              className="settings-button is-primary"
              type="button"
              onClick={() => void selectProvider(configuredProvider.instanceId)}
            >
              Use {configuredProvider.name}
            </button> : null)}
          </SettingsRow> : null}
        </SettingsSection>

        <SettingsSection
          title="Model"
          description={`Discovered from ${activeProvider?.name || 'the active provider'}. Applies to filing and Ask Tagvico.`}
        >
          <SettingsRow title="Model" description="Search live models, favorite frequent choices and inspect capabilities." stack>
            <ModelPicker
              providers={settings.ai.providers}
              activeProviderId={settings.ai.activeProviderInstanceId}
              activeModelId={settings.ai.activeModelId}
              models={activeModels}
              loading={modelsLoading}
              error={modelsError}
              onProviderChange={selectProvider}
              onRefresh={async () => { await loadModels(); }}
              onSelect={selectModel}
            />
            {recommendedModel ? <div className="settings-action-cluster">
              <span className="settings-field-help">
                {recommendedModel.id === settings.ai.activeModelId
                  ? `${recommendedModel.name} is the recommended default for filing invoices, letters and forms.`
                  : `${recommendedModel.name} is the recommended default for filing.`}
              </span>
              {recommendedModel.id !== settings.ai.activeModelId ? <button
                className="settings-button"
                type="button"
                onClick={() => void selectModel(recommendedModel)}
              >
                Use {recommendedModel.name}
              </button> : null}
            </div> : null}
            {activeProvider?.manualModelInput ? <>
              <button
                className="settings-link-button"
                type="button"
                aria-expanded={manualModelOpen}
                onClick={() => setManualModelOpen((open) => !open)}
              >
                {manualModelOpen ? 'Hide manual model ID' : 'Use another model ID'}
              </button>
              {manualModelOpen ? <DraftField
                label="Manual model ID"
                description="Use this only when the provider has no catalog or a new model is not listed yet."
                value={settings.ai.activeModelId}
                placeholder="provider/model-id"
                error={errorFor('ai.activeModelId')}
                onCommit={(activeModelId) => applyPatch({ ai: { activeModelId } }, 'Model ID saved.')}
              /> : null}
            </> : null}
            {activeModel?.options.map((option) => {
              if (option.type !== 'select') return null;
              const current = String(settings.ai.modelOptions[option.id] ?? option.defaultValue ?? option.values[0]?.id ?? '');
              const save = (value: string) => void applyPatch({
                ai: { modelOptions: { [option.id]: value } }
              }, `${option.label} saved.`);
              if (option.values.length <= 4) {
                return <fieldset className="settings-field settings-segmented" key={option.id}>
                  <legend className="settings-field-label">{option.label}<small>Runtime capability</small></legend>
                  <div className="settings-segmented-options">
                    {option.values.map((value) => <label className={value.id === current ? 'is-active' : undefined} key={value.id}>
                      <input
                        type="radio"
                        name={`model-option-${option.id}`}
                        value={value.id}
                        checked={value.id === current}
                        onChange={() => save(value.id)}
                      />
                      <span>{value.label}</span>
                    </label>)}
                  </div>
                  {option.description ? <span className="settings-field-help">{option.description}</span> : null}
                </fieldset>;
              }
              return <label className="settings-field" key={option.id}>
                <span className="settings-field-label">{option.label}<small>Runtime capability</small></span>
                <select className="settings-select" value={current} onChange={(event) => save(event.target.value)}>
                  {option.values.map((value) => <option value={value.id} key={value.id}>{value.label}</option>)}
                </select>
                {option.description ? <span className="settings-field-help">{option.description}</span> : null}
              </label>;
            })}
            {!activeModel && !modelsLoading ? <InlineStatus kind="neutral">
              Load the live catalog to reveal model-specific options such as thinking effort.
            </InlineStatus> : null}
          </SettingsRow>
        </SettingsSection>
      </>;
    }
    if (section === 'automation') {
      return <><SettingsSection title="Processing schedule" description="Changes are persisted only on blur, Enter or an explicit switch action.">
        <SettingsRow title="Scan interval" description="Cron syntax. The default runs every 30 minutes.">
          <DraftField
            label="Cron expression"
            value={settings.automation.scanInterval}
            error={errorFor('automation.scanInterval')}
            onCommit={(scanInterval) => applyPatch({ automation: { scanInterval } }, 'Schedule saved.')}
          />
        </SettingsRow>
        <SettingsRow title="Automatic processing" description="Process new documents on the configured schedule.">
          <SettingSwitch
            checked={settings.automation.automaticProcessing}
            label="Automatic processing"
            onCheckedChange={(automaticProcessing) => void applyPatch({ automation: { automaticProcessing } })}
          />
        </SettingsRow>
        <SettingsRow title="Eligible documents" description="Trigger tags are optional. Without them, every new unprocessed document is scanned.">
          <InlineStatus kind={settings.tags.triggerTags.length ? 'neutral' : 'success'}>
            {settings.tags.triggerTags.length
              ? `Only documents tagged ${settings.tags.triggerTags.join(', ')} are eligible.`
              : 'All new documents are eligible. No trigger tag is required.'}
          </InlineStatus>
        </SettingsRow>
        <SettingsRow title="Processing mode" description="Batch mode may trade latency for lower provider cost.">
          <select
            className="settings-select"
            value={settings.automation.processingMode}
            onChange={(event) => void applyPatch({ automation: { processingMode: event.target.value } })}
          >
            <option value="standard">Standard</option>
            <option value="flex">Flex</option>
            <option value="batch">Batch</option>
          </select>
        </SettingsRow>
        <SettingsRow title="Write mode" description="Review-first stages suggestions for approval. Automatic writes approved metadata directly." stack>
          <div className="settings-mode-grid">
            <label className={settings.automation.writeMode === 'review' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="write_mode"
                value="review"
                checked={settings.automation.writeMode === 'review'}
                onChange={() => void applyPatch({ automation: { writeMode: 'review' } }, 'Review-first mode enabled.')}
              />
              <span><strong>Review first</strong><small>Stage every suggestion in the review queue before Paperless changes.</small></span>
            </label>
            <label className={settings.automation.writeMode === 'automatic' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="write_mode"
                value="automatic"
                checked={settings.automation.writeMode === 'automatic'}
                onChange={() => void applyPatch({ automation: { writeMode: 'automatic' } }, 'Automatic write mode enabled.')}
              />
              <span><strong>Full access</strong><small>Apply metadata automatically when policy and confidence checks pass.</small></span>
            </label>
          </div>
        </SettingsRow>
      </SettingsSection>
      {channels ? <ChannelSettings channels={channels} onMessage={showMessage} /> : null}
      <SettingsSection title="Metadata behavior" description="Decide which existing information the model may reuse and which fields it may propose.">
        <SettingsRow title="Reuse existing metadata" description="Include existing tags, correspondent and document type as context instead of starting from an empty record.">
          <SettingSwitch
            checked={settings.automation.useExistingData}
            label="Reuse existing metadata"
            onCheckedChange={(useExistingData) => void applyPatch({ automation: { useExistingData } })}
          />
        </SettingsRow>
        <SettingsRow title="Custom fields" description="Let the model populate the explicit custom-field definitions listed under Paperless custom fields below.">
          <SettingSwitch
            checked={settings.automation.assignCustomFields}
            label="Populate custom fields"
            onCheckedChange={(assignCustomFields) => void applyPatch({ automation: { assignCustomFields } })}
          />
        </SettingsRow>
        <SettingsRow title="Owner assignment" description="Match documents to Paperless users using the profiles below.">
          <SettingSwitch
            checked={settings.automation.assignOwner}
            label="Assign document owners"
            onCheckedChange={(assignOwner) => void applyPatch({ automation: { assignOwner } })}
          />
        </SettingsRow>
        <SettingsRow title="Owner profiles" description="One profile per line, for example: alex: health insurance, private invoices." stack>
          <DraftTextarea
            label="Matching hints"
            value={settings.automation.ownerProfiles}
            rows={6}
            placeholder={'alex: private invoices, health insurance\nfinance: vendor bills, receipts'}
            onCommit={(ownerProfiles) => applyPatch({ automation: { ownerProfiles } }, 'Owner profiles saved.')}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Paperless custom fields" description="Only fields listed here may be proposed by the model.">
        <SettingsRow title="Allowed fields" description="Names and types must match your Paperless custom-field setup." stack>
          <CustomFieldsEditor fields={settings.security.customFields} onChange={(customFields) => applyPatch({ security: { customFields } }, 'Custom fields saved.')} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="AI instructions" description="Tune filing behavior without replacing Tagvico's structured-output and safety contracts.">
        <SettingsRow title="Custom filing prompt" description="Optional instructions for your own archive, terminology and filing preferences." stack>
          <DraftTextarea
            label="Additional instructions"
            value={settings.automation.customPrompt}
            rows={7}
            placeholder="For example: Prefer broad reusable tags. Treat apprenticeship documents as Education."
            description="Applied to automatic scans and manual document analysis. Leave empty to use Tagvico's general prompt."
            onCommit={(customPrompt) => applyPatch({ automation: { customPrompt } }, 'Custom filing prompt saved.')}
          />
        </SettingsRow>
        <details className="settings-advanced">
          <summary>Advanced system prompt</summary>
          <div className="settings-advanced-content">
            <InlineStatus kind="neutral">
              Advanced changes affect every provider. Tagvico still appends its immutable prompt-injection, minimal-tagging and structured-output rules.
            </InlineStatus>
            <DraftTextarea
              label="System instructions"
              value={settings.automation.advancedSystemPrompt}
              rows={10}
              placeholder="Leave empty to use Tagvico's maintained general system prompt."
              description="Use this only when the normal custom filing prompt is not sufficient."
              onCommit={(advancedSystemPrompt) => applyPatch({ automation: { advancedSystemPrompt } }, 'Advanced system prompt saved.')}
            />
          </div>
        </details>
      </SettingsSection></>;
    }
    if (section === 'tags') {
      return <>
        <SettingsSection title="Tagging policy" description={`${settings.tags.vocabularySize} unique tags are currently enabled.`}>
          <SettingsRow title="Controlled tagging" description="The model may assign only exact tags from enabled groups.">
            <SettingSwitch
              checked={settings.tags.controlled}
              label="Controlled tagging"
              onCheckedChange={(controlled) => void applyPatch({ tags: { controlled } })}
            />
          </SettingsRow>
          {settings.tags.controlled && settings.tags.vocabularySize === 0 ? <div className="settings-row">
            <InlineStatus kind="error">
              Controlled tagging is on, but no group is enabled, so the model cannot assign any tag. Enable a group below or turn controlled tagging off.
            </InlineStatus>
          </div> : null}
          <SettingsRow title="Maximum tags per document" description="Keep the filing result focused.">
            <DraftField
              label="Maximum"
              type="number"
              value={String(settings.tags.maximumPerDocument)}
              error={errorFor('tags.maximumPerDocument')}
              onCommit={(value) => applyPatch({ tags: { maximumPerDocument: Number(value) } })}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Vocabulary groups" description="Compact groups make enablement and vocabulary editing visible without giant checkbox cards.">
          <div className="settings-tag-create">
            <label>
              <span>New custom group</span>
              <input
                className="settings-input"
                value={newTagGroupName}
                maxLength={120}
                placeholder="For example: Travel"
                onChange={(event) => setNewTagGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addTagGroup();
                  }
                }}
              />
            </label>
            <button className="settings-button" type="button" disabled={!newTagGroupName.trim()} onClick={() => void addTagGroup()}>
              Create group
            </button>
          </div>
          <div className="settings-tag-grid">
            {settings.tags.groups.map((group) => <TagGroupCard
              key={group.id}
              group={group}
              duplicateTags={duplicateTagsByGroup[group.id]}
              onChange={updateTagGroup}
              onDelete={deleteTagGroup}
            />)}
          </div>
        </SettingsSection>
        <SettingsSection
          title="Unify duplicate tags"
          description="Tag cleanup now has a dedicated review workspace with a clear many-to-one impact preview."
        >
          <SettingsRow
            title="Open tag organizer"
            description="Analysis is read-only. Moving documents and deleting the unused source remain explicit, separate and auditable."
          >
            <Link className="settings-button is-primary" href="/tags">Organize tags</Link>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Assigned metadata">
          {([
            ['assignTags', 'Tags', 'Let the model assign tags.'],
            ['assignCorrespondents', 'Correspondent', 'Let the model assign a correspondent.'],
            ['assignDocumentType', 'Document type', 'Let the model assign a document type.'],
            ['assignTitle', 'Title', 'Let the model improve the document title.']
          ] as const).map(([key, title, description]) => <SettingsRow key={key} title={title} description={description}>
            <SettingSwitch
              checked={settings.tags[key]}
              label={title}
              onCheckedChange={(checked) => void applyPatch({ tags: { [key]: checked } })}
            />
          </SettingsRow>)}
        </SettingsSection>
        <SettingsSection title="Processing markers" description="Keep automation predictable when you trigger scans with tags or mark completed documents.">
          <SettingsRow title="AI-processed tag" description="Add a stable marker after Tagvico successfully processes a document." stack>
            <SettingSwitch
              checked={settings.tags.addProcessedTag}
              label="Add processed tag"
              onCheckedChange={(addProcessedTag) => void applyPatch({ tags: { addProcessedTag } })}
            />
            <DraftField
              label="Processed tag name"
              value={settings.tags.processedTagName}
              disabled={!settings.tags.addProcessedTag}
              error={errorFor('tags.processedTagName')}
              onCommit={(processedTagName) => applyPatch({ tags: { processedTagName } }, 'Processed tag name saved.')}
            />
          </SettingsRow>
          <SettingsRow title="Optional trigger tags" description="Leave empty to scan every new document. Add tags only when you intentionally want an opt-in queue." stack>
            <DraftField
              label="Only scan documents tagged"
              value={settings.tags.triggerTags.join(', ')}
              placeholder="todo-ai, inbox-ai"
              onCommit={(value) => applyPatch({ tags: { triggerTags: value.split(',').map((tag) => tag.trim()).filter(Boolean) } }, 'Trigger tags saved.')}
            />
            <InlineStatus kind={settings.tags.triggerTags.length ? 'neutral' : 'success'}>
              {settings.tags.triggerTags.length
                ? `${settings.tags.triggerTags.length} trigger tag${settings.tags.triggerTags.length === 1 ? '' : 's'} restrict automatic scanning.`
                : 'No trigger tags configured — all new unprocessed documents will be scanned.'}
            </InlineStatus>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Existing vocabulary boundaries" description="Prevent automation from creating new filing entities in Paperless.">
          {([
            ['restrictToExistingTags', 'Existing tags only', 'Never create a new Paperless tag.'],
            ['restrictToExistingCorrespondents', 'Existing correspondents only', 'Never create a new correspondent.'],
            ['restrictToExistingDocumentTypes', 'Existing document types only', 'Never create a new document type.']
          ] as const).map(([key, title, description]) => <SettingsRow key={key} title={title} description={description}>
            <SettingSwitch
              checked={settings.tags[key]}
              label={title}
              onCheckedChange={(checked) => void applyPatch({ tags: { [key]: checked } })}
            />
          </SettingsRow>)}
        </SettingsSection>
      </>;
    }
    return <>
      <HouseholdSettings {...household} onMessage={showMessage} />
      {household.currentRole === 'owner' ? <>
      <SettingsSection title="Multi-factor authentication" description="Protect this Tagvico account with a TOTP authenticator.">
        <SettingsRow title="Authenticator app" description="Setup secrets expire after ten minutes and are shown only during enrollment." stack>
          <MfaSettings />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Local API authentication" description="This write-only key protects authenticated Tagvico API requests; it is separate from outbound enrichment.">
        <SettingsRow title="Tagvico API key" description="Use at least 32 characters. Leaving this empty retains the configured key." stack>
          <DraftField
            label="Tagvico API key"
            type="password"
            value=""
            configured={settings.security.apiKey.configured}
            error={errorFor('security.apiKey')}
            onCommit={(apiKey) => applyPatch({ security: { apiKey } })}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="External enrichment" description="Optional outbound lookup performed during analysis. Keep it disabled unless the destination is trusted.">
        <SettingsRow title="Enable enrichment" description="Attach a controlled external response to the analysis prompt. This does not expose or enable the Tagvico API.">
          <SettingSwitch
            checked={settings.security.externalApiEnabled}
            label="External enrichment"
            onCheckedChange={(externalApiEnabled) => void applyPatch({ security: { externalApiEnabled } })}
          />
        </SettingsRow>
        <SettingsRow title="Request" description="URL, HTTP method and timeout for the controlled lookup." stack>
          <div className="settings-fields-grid">
            <DraftField label="URL" type="url" value={settings.security.externalApiUrl} placeholder="https://api.example.com/lookup" error={errorFor('security.externalApiUrl')} onCommit={(externalApiUrl) => applyPatch({ security: { externalApiUrl } })} />
            <label className="settings-field">
              <span className="settings-field-label">Method</span>
              <select className="settings-select" value={settings.security.externalApiMethod} onChange={(event) => void applyPatch({ security: { externalApiMethod: event.target.value } })}>
                <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
              </select>
            </label>
            <DraftField label="Timeout (ms)" type="number" value={String(settings.security.externalApiTimeout)} error={errorFor('security.externalApiTimeout')} onCommit={(value) => applyPatch({ security: { externalApiTimeout: Number(value) } })} />
            <DraftField label="Response selector" value={settings.security.externalApiSelector} placeholder="result.invoice.vendor" onCommit={(externalApiSelector) => applyPatch({ security: { externalApiSelector } })} />
          </div>
        </SettingsRow>
        <SettingsRow title="Headers and body" description="These JSON values are write-only because they may contain credentials. Empty fields retain the stored values." stack>
          <div className="settings-fields-grid">
            <DraftTextarea
              label="Headers JSON"
              value=""
              rows={6}
              sensitive
              configured={settings.security.externalApiHeaders.configured}
              error={errorFor('security.externalApiHeaders')}
              onCommit={(externalApiHeaders) => applyPatch({ security: { externalApiHeaders } })}
            />
            <DraftTextarea
              label="Body JSON"
              value=""
              rows={6}
              sensitive
              configured={settings.security.externalApiBody.configured}
              error={errorFor('security.externalApiBody')}
              onCommit={(externalApiBody) => applyPatch({ security: { externalApiBody } })}
            />
          </div>
        </SettingsRow>
      </SettingsSection>
      </> : null}
      {household.currentRole === 'owner' ? <SettingsSection title="Privacy" description="Telemetry is a minimal heartbeat without document content.">
        <SettingsRow title="Anonymous telemetry" description="Send a minimal, non-document heartbeat to help improve Tagvico.">
          <div className="settings-action-cluster">
            <SettingSwitch
              checked={settings.general.telemetryEnabled}
              disabled={!settings.general.telemetryAvailable}
              label="Anonymous telemetry"
              onCheckedChange={(telemetryEnabled) => void applyPatch({ general: { telemetryEnabled } })}
            />
            {!settings.general.telemetryAvailable
              ? <span className="settings-badge">Collector not configured</span>
              : null}
          </div>
        </SettingsRow>
      </SettingsSection> : null}
    </>;
  })();

  return <div className="settings-page">
    <header className="settings-page-head">
      <div>
        <h1>{settingsSectionTitles[section]}</h1>
        <p>{descriptions[section]}</p>
      </div>
    </header>
    <div className="settings-layout">
      <div className="settings-side">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections
            .filter(({ id }) => household.currentRole === 'owner' || id === 'people')
            .map(({ id, Icon }) => <Link
              key={id}
              href={`/settings/${id}`}
              className={section === id ? 'is-active' : undefined}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{settingsSectionTitles[id]}</span>
            </Link>)}
        </nav>
        <p className="settings-version">Tagvico v{settings.diagnostics.version}</p>
      </div>
      <div className="settings-content">{content}</div>
    </div>
    {toast ? <div className={`settings-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div> : null}
  </div>;
}
