'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  FileStack,
  MessageSquare,
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
import { legacyChannelAnchors, settingsSectionTitles } from './sections';
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
  { id: 'channels', Icon: MessageSquare },
  { id: 'tags', Icon: Tags },
  { id: 'people', Icon: UsersRound }
] as const;

/** Provider errors can carry a pasted JSON body; show only the readable first line. */
const plainError = (message: string) => message.split('\n')[0].replace(/:\s*[{[].*$/, '').slice(0, 220);

/** The recommended default for filing; shown as such wherever a provider offers it. */
const isRecommendedModel = (modelId: string) => /(^|\/)gpt-6-luna$/i.test(modelId);


type HouseholdProps = {
  currentMemberId: string;
  currentRole: string;
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

/**
 * Installation settings (prompts, owner profiles, provider configuration)
 * only reach the browser of the owner. Everyone else gets the household
 * section, which runs on the household props alone.
 */
export function SettingsWorkspace({
  section,
  initialSettings,
  channels,
  household
}: {
  section: SettingsSectionId;
  initialSettings: SettingsResponse | null;
  channels: Record<ChannelId, ChannelSettingsView> | null;
  household: HouseholdProps;
}) {
  if (!initialSettings) return <MemberSettingsPage household={household} />;
  return <OwnerSettingsWorkspace
    section={section}
    initialSettings={initialSettings}
    channels={channels}
    household={household}
  />;
}

function MemberSettingsPage({ household }: { household: HouseholdProps }) {
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);
  const showMessage = (kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };
  return <div className="page-column is-wide set-page">
    <header className="page-header"><h1 className="page-title">Settings</h1></header>
    <div className="set-layout">
      <div className="set-side">
        <nav className="set-nav" aria-label="Settings sections">
          <Link href="/settings/people" className="is-active" aria-current="page">
            <UsersRound aria-hidden="true" />
            <span>{settingsSectionTitles.people}</span>
          </Link>
        </nav>
      </div>
      <div className="set-content"><HouseholdSettings {...household} onMessage={showMessage} /></div>
    </div>
    {toast ? <div className={`set-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div> : null}
  </div>;
}

function OwnerSettingsWorkspace({
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
  const router = useRouter();

  // Channel cards used to live in Automation; an old #telegram or #discord link goes to the Channels tab.
  useEffect(() => {
    if (section !== 'automation') return;
    const anchor = window.location.hash.replace(/^#/, '').toLowerCase();
    if (legacyChannelAnchors.includes(anchor)) router.replace('/settings/channels');
  }, [section, router]);

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
      return <SettingsSection title="Connection" description="The API token is write-only. Every save is checked against Paperless.">
        <PaperlessConnection paperless={settings.paperless} applyPatch={applyPatch} errorFor={errorFor} />
        <SettingsRow title="Find Paperless-ngx" description="Scans common local addresses. Nothing is saved." stack>
          <PaperlessDiscovery baseUrl={settings.paperless.baseUrl} />
        </SettingsRow>
      </SettingsSection>;
    }
    if (section === 'providers') {
      const selected = configuredProvider;
      const selectedIsChatGPT = selected?.instanceId === 'chatgpt';
      const probeActions = (provider: { instanceId: string; name: string }, extra?: ReactNode) => <div className="set-actions is-start">
        {extra}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            setConfiguredProviderId(provider.instanceId);
            void probeProvider(provider.instanceId);
          }}
        >
          Test {provider.name}
        </button>
        {probeStatus && configuredProvider?.instanceId === provider.instanceId
          ? <InlineStatus kind={probeStatus.startsWith('Connected') ? 'success' : probeStatus.includes('…') ? 'loading' : 'error'}>{probeStatus}</InlineStatus>
          : null}
      </div>;
      const providerPanel = selectedIsChatGPT ? <div className="set-panel">
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
        {chatgptProvider && chatgptAuth.authenticated ? probeActions(
          chatgptProvider,
          settings.ai.activeProviderInstanceId !== 'chatgpt'
            ? <button className="btn btn-primary" type="button" onClick={() => void selectProvider('chatgpt')}>
                Use ChatGPT plan for Tagvico
              </button>
            : null
        ) : null}
      </div> : selected ? <div className="set-panel">
        {selected.fields.length ? selected.fields.map((field) => {
          const stored = selected.configuration[field.key];
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
                provider: { instanceId: selected.instanceId, values: { [field.key]: value } }
              }, `${field.label} saved.`);
              if (saved) {
                setModelsByProvider((current) => {
                  const next = { ...current };
                  delete next[selected.instanceId];
                  return next;
                });
              }
            }}
          />;
        }) : <InlineStatus kind="neutral">This runtime signs in with an account instead of an API key.</InlineStatus>}
        {selected.instanceId === 'codex' ? <div className="set-auth">
          <div className="set-actions is-start">
            <InlineStatus kind={providerAuth.loading ? 'loading' : providerAuth.authenticated ? 'success' : 'neutral'}>
              {providerAuth.loading ? 'Checking account…' : providerAuth.label}
            </InlineStatus>
            <button className="btn btn-secondary" type="button" disabled={Boolean(codexLogin)} onClick={() => void startCodexLogin()}>
              {codexLogin ? 'Waiting for sign-in…' : providerAuth.authenticated ? 'Reconnect ChatGPT' : 'Sign in with ChatGPT'}
            </button>
            {providerAuth.authenticated
              ? <button className="btn btn-danger" type="button" onClick={() => void logoutProvider('codex')}>Sign out</button>
              : null}
          </div>
          {codexLoginOutput ? <pre className="set-auth-output">{codexLoginOutput}</pre> : null}
        </div> : null}
        {selected.instanceId === 'copilot' ? <div className="set-auth">
          <div className="set-actions is-start">
            <InlineStatus kind={providerAuth.loading ? 'loading' : providerAuth.authenticated ? 'success' : 'neutral'}>
              {providerAuth.loading ? 'Checking account…' : providerAuth.label}
            </InlineStatus>
            <button className="btn btn-secondary" type="button" disabled={Boolean(copilotLogin)} onClick={() => void startCopilotLogin()}>
              {copilotLogin ? 'Waiting for sign-in…' : providerAuth.authenticated ? 'Reconnect Copilot' : 'Sign in with GitHub'}
            </button>
            {providerAuth.authenticated
              ? <button className="btn btn-danger" type="button" onClick={() => void logoutProvider('copilot')}>Sign out</button>
              : null}
          </div>
          {copilotChallenge.verificationUrl ? <p className="set-note">
            Code <strong>{copilotChallenge.userCode}</strong>{' '}
            <a className="link" href={copilotChallenge.verificationUrl} target="_blank" rel="noreferrer">Open GitHub device sign-in</a>
          </p> : null}
        </div> : null}
        {probeActions(selected, selected.instanceId !== settings.ai.activeProviderInstanceId ? <button
          className="btn btn-primary"
          type="button"
          onClick={() => void selectProvider(selected.instanceId)}
        >
          Use {selected.name}
        </button> : null)}
      </div> : null;
      return <>
        <SettingsSection title="Provider" description="Tagvico uses one provider for filing and chat. Keys are write-only.">
          <ProviderPicker
            providers={settings.ai.providers}
            selectedId={selected?.instanceId || ''}
            activeId={settings.ai.activeProviderInstanceId}
            onSelect={setConfiguredProviderId}
          />
          {providerPanel}
        </SettingsSection>

        <SettingsSection title="Model">
          <SettingsRow title="Model" description={`From ${activeProvider?.name || 'the active provider'}.`}>
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
          </SettingsRow>
          {recommendedModel && recommendedModel.id !== settings.ai.activeModelId ? <SettingsRow
            title={`${recommendedModel.name} is recommended for filing`}
          >
            <button className="btn btn-secondary" type="button" onClick={() => void selectModel(recommendedModel)}>
              Use {recommendedModel.name}
            </button>
          </SettingsRow> : null}
          {activeProvider?.manualModelInput ? <>
            <div className="set-row">
              <button
                className="btn btn-ghost"
                type="button"
                aria-expanded={manualModelOpen}
                onClick={() => setManualModelOpen((open) => !open)}
              >
                {manualModelOpen ? 'Hide manual model ID' : 'Use another model ID'}
              </button>
            </div>
            {manualModelOpen ? <DraftField
              label="Manual model ID"
              description="For providers without a catalog, or a model that is not listed yet."
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
            return <SettingsRow title={option.label} description={option.description} key={option.id}>
              {option.values.length <= 4
                ? <div className="segmented" role="radiogroup" aria-label={option.label}>
                    {option.values.map((value) => <label className={`segmented-item${value.id === current ? ' is-active' : ''}`} key={value.id}>
                      <input
                        className="sr-only"
                        type="radio"
                        name={`model-option-${option.id}`}
                        value={value.id}
                        checked={value.id === current}
                        onChange={() => save(value.id)}
                      />
                      <span>{value.label}</span>
                    </label>)}
                  </div>
                : <select className="select" aria-label={option.label} value={current} onChange={(event) => save(event.target.value)}>
                    {option.values.map((value) => <option value={value.id} key={value.id}>{value.label}</option>)}
                  </select>}
            </SettingsRow>;
          })}
          {!activeModel && !modelsLoading ? <InlineStatus kind="neutral">
            Model options such as thinking effort appear once the live catalog has loaded.
          </InlineStatus> : null}
        </SettingsSection>
      </>;
    }
    if (section === 'automation') {
      return <>
        <SettingsSection title="Processing">
          <DraftField
            label="Scan schedule"
            description="Cron expression. The default is every 30 minutes."
            value={settings.automation.scanInterval}
            error={errorFor('automation.scanInterval')}
            onCommit={(scanInterval) => applyPatch({ automation: { scanInterval } }, 'Schedule saved.')}
          />
          <SettingsRow title="Automatic processing">
            <SettingSwitch
              checked={settings.automation.automaticProcessing}
              label="Automatic processing"
              onCheckedChange={(automaticProcessing) => void applyPatch({ automation: { automaticProcessing } })}
            />
          </SettingsRow>
          <SettingsRow title="Documents to scan">
            <span className="set-value">
              {settings.tags.triggerTags.length
                ? `Tagged ${settings.tags.triggerTags.join(', ')}`
                : 'All new documents'}
              {' '}
              <Link className="link" href="/settings/tags">Change</Link>
            </span>
          </SettingsRow>
          <SettingsRow title="Processing mode" description="Batch can lower cost but is slower.">
            <select
              className="select"
              aria-label="Processing mode"
              value={settings.automation.processingMode}
              onChange={(event) => void applyPatch({ automation: { processingMode: event.target.value } })}
            >
              <option value="standard">Standard</option>
              <option value="flex">Flex</option>
              <option value="batch">Batch</option>
            </select>
          </SettingsRow>
          <SettingsRow title="Write mode" stack>
            <div className="set-radio-list">
              <label className={settings.automation.writeMode === 'review' ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="write_mode"
                  value="review"
                  checked={settings.automation.writeMode === 'review'}
                  onChange={() => void applyPatch({ automation: { writeMode: 'review' } }, 'Review-first mode enabled.')}
                />
                <span><strong>Review first</strong><small>Suggestions wait in the review queue until you approve them.</small></span>
              </label>
              <label className={settings.automation.writeMode === 'automatic' ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="write_mode"
                  value="automatic"
                  checked={settings.automation.writeMode === 'automatic'}
                  onChange={() => void applyPatch({ automation: { writeMode: 'automatic' } }, 'Automatic write mode enabled.')}
                />
                <span><strong>Full access</strong><small>Metadata is applied automatically when policy and confidence checks pass.</small></span>
              </label>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Metadata">
          <SettingsRow title="Reuse existing metadata" description="Give the model the current tags, correspondent and type as context.">
            <SettingSwitch
              checked={settings.automation.useExistingData}
              label="Reuse existing metadata"
              onCheckedChange={(useExistingData) => void applyPatch({ automation: { useExistingData } })}
            />
          </SettingsRow>
          <SettingsRow title="Fill custom fields" description="Only the fields listed under Custom fields.">
            <SettingSwitch
              checked={settings.automation.assignCustomFields}
              label="Populate custom fields"
              onCheckedChange={(assignCustomFields) => void applyPatch({ automation: { assignCustomFields } })}
            />
          </SettingsRow>
          <SettingsRow title="Assign owners" description="Match documents to Paperless users using the profiles below.">
            <SettingSwitch
              checked={settings.automation.assignOwner}
              label="Assign document owners"
              onCheckedChange={(assignOwner) => void applyPatch({ automation: { assignOwner } })}
            />
          </SettingsRow>
          <DraftTextarea
            label="Owner profiles"
            description="One per line, for example: alex: health insurance, private invoices."
            value={settings.automation.ownerProfiles}
            rows={5}
            placeholder={'alex: private invoices, health insurance\nfinance: vendor bills, receipts'}
            onCommit={(ownerProfiles) => applyPatch({ automation: { ownerProfiles } }, 'Owner profiles saved.')}
          />
        </SettingsSection>

        <SettingsSection title="Custom fields">
          <SettingsRow title="Allowed fields" description="Names and types must match Paperless. The model may only fill these." stack>
            <CustomFieldsEditor fields={settings.security.customFields} onChange={(customFields) => applyPatch({ security: { customFields } }, 'Custom fields saved.')} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="AI instructions">
          <DraftTextarea
            label="Additional instructions"
            description="Optional. Applied to scans and manual analysis."
            value={settings.automation.customPrompt}
            rows={6}
            placeholder="For example: Prefer broad reusable tags. Treat apprenticeship documents as Education."
            onCommit={(customPrompt) => applyPatch({ automation: { customPrompt } }, 'Custom filing prompt saved.')}
          />
          <details className="set-advanced">
            <summary>Advanced system prompt</summary>
            <div className="set-advanced-content">
              <p className="set-note">Applies to every provider. Tagvico still adds its fixed rules for prompt injection, minimal tagging and structured output.</p>
              <DraftTextarea
                label="System instructions"
                description="Leave empty to use the maintained default."
                value={settings.automation.advancedSystemPrompt}
                rows={9}
                placeholder="Leave empty to use Tagvico's general system prompt."
                onCommit={(advancedSystemPrompt) => applyPatch({ automation: { advancedSystemPrompt } }, 'Advanced system prompt saved.')}
              />
            </div>
          </details>
        </SettingsSection>
      </>;
    }
    if (section === 'channels') {
      return channels ? <ChannelSettings channels={channels} onMessage={showMessage} /> : null;
    }
    if (section === 'tags') {
      return <>
        <SettingsSection title="Policy">
          <SettingsRow
            title="Controlled tagging"
            description={`Only exact tags from enabled groups. ${settings.tags.vocabularySize} enabled.`}
          >
            <SettingSwitch
              checked={settings.tags.controlled}
              label="Controlled tagging"
              onCheckedChange={(controlled) => void applyPatch({ tags: { controlled } })}
            />
          </SettingsRow>
          {settings.tags.controlled && settings.tags.vocabularySize === 0 ? <div className="set-row">
            <InlineStatus kind="error">
              Controlled tagging is on, but no group is enabled, so the model cannot assign any tag. Enable a group below or turn controlled tagging off.
            </InlineStatus>
          </div> : null}
          <DraftField
            label="Maximum tags per document"
            type="number"
            value={String(settings.tags.maximumPerDocument)}
            error={errorFor('tags.maximumPerDocument')}
            onCommit={(value) => applyPatch({ tags: { maximumPerDocument: Number(value) } })}
          />
        </SettingsSection>

        <SettingsSection title="Vocabulary groups">
          <form className="set-inline-form" onSubmit={(event) => { event.preventDefault(); void addTagGroup(); }}>
            <input
              className="input"
              aria-label="New custom group"
              value={newTagGroupName}
              maxLength={120}
              placeholder="New custom group, for example Travel"
              onChange={(event) => setNewTagGroupName(event.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={!newTagGroupName.trim()}>
              Create group
            </button>
          </form>
          <div className="set-tag-groups">
            {settings.tags.groups.map((group) => <TagGroupCard
              key={group.id}
              group={group}
              duplicateTags={duplicateTagsByGroup[group.id]}
              onChange={updateTagGroup}
              onDelete={deleteTagGroup}
            />)}
          </div>
          <SettingsRow title="Duplicate tags" description="Find overlapping tags and merge them in two steps.">
            <Link className="btn btn-secondary" href="/tags">Organize tags</Link>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="The model may assign">
          {([
            ['assignTags', 'Tags'],
            ['assignCorrespondents', 'Correspondent'],
            ['assignDocumentType', 'Document type'],
            ['assignTitle', 'Title']
          ] as const).map(([key, title]) => <SettingsRow key={key} title={title}>
            <SettingSwitch
              checked={settings.tags[key]}
              label={title}
              onCheckedChange={(checked) => void applyPatch({ tags: { [key]: checked } })}
            />
          </SettingsRow>)}
        </SettingsSection>

        <SettingsSection title="Never create new">
          {([
            ['restrictToExistingTags', 'Existing tags only'],
            ['restrictToExistingCorrespondents', 'Existing correspondents only'],
            ['restrictToExistingDocumentTypes', 'Existing document types only']
          ] as const).map(([key, title]) => <SettingsRow key={key} title={title}>
            <SettingSwitch
              checked={settings.tags[key]}
              label={title}
              onCheckedChange={(checked) => void applyPatch({ tags: { [key]: checked } })}
            />
          </SettingsRow>)}
        </SettingsSection>

        <SettingsSection title="Markers">
          <SettingsRow title="AI-processed tag" description="Added after Tagvico processes a document.">
            <SettingSwitch
              checked={settings.tags.addProcessedTag}
              label="Add processed tag"
              onCheckedChange={(addProcessedTag) => void applyPatch({ tags: { addProcessedTag } })}
            />
          </SettingsRow>
          <DraftField
            label="Processed tag name"
            value={settings.tags.processedTagName}
            disabled={!settings.tags.addProcessedTag}
            error={errorFor('tags.processedTagName')}
            onCommit={(processedTagName) => applyPatch({ tags: { processedTagName } }, 'Processed tag name saved.')}
          />
          <DraftField
            label="Only scan documents tagged"
            description="Optional. Empty scans every new document."
            value={settings.tags.triggerTags.join(', ')}
            placeholder="todo-ai, inbox-ai"
            onCommit={(value) => applyPatch({ tags: { triggerTags: value.split(',').map((tag) => tag.trim()).filter(Boolean) } }, 'Trigger tags saved.')}
          />
        </SettingsSection>
      </>;
    }
    return <>
      <HouseholdSettings {...household} onMessage={showMessage} />
      {household.currentRole === 'owner' ? <>
        <SettingsSection title="Security" description="Keys and JSON values here are write-only. Empty fields keep the saved value.">
          <SettingsRow title="Two-factor authentication" description="Authenticator app. Setup secrets expire after ten minutes." stack>
            <MfaSettings />
          </SettingsRow>
          <DraftField
            label="Tagvico API key"
            type="password"
            value=""
            description="At least 32 characters."
            configured={settings.security.apiKey.configured}
            error={errorFor('security.apiKey')}
            onCommit={(apiKey) => applyPatch({ security: { apiKey } })}
          />
        </SettingsSection>

        <SettingsSection title="External enrichment">
          <SettingsRow title="Enable lookup" description="Adds a response from an outside service to the analysis prompt. Keep it off unless you trust the destination.">
            <SettingSwitch
              checked={settings.security.externalApiEnabled}
              label="External enrichment"
              onCheckedChange={(externalApiEnabled) => void applyPatch({ security: { externalApiEnabled } })}
            />
          </SettingsRow>
          <DraftField label="URL" type="url" value={settings.security.externalApiUrl} placeholder="https://api.example.com/lookup" error={errorFor('security.externalApiUrl')} onCommit={(externalApiUrl) => applyPatch({ security: { externalApiUrl } })} />
          <SettingsRow title="Method">
            <select className="select" aria-label="Method" value={settings.security.externalApiMethod} onChange={(event) => void applyPatch({ security: { externalApiMethod: event.target.value } })}>
              <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
            </select>
          </SettingsRow>
          <DraftField label="Timeout (ms)" type="number" value={String(settings.security.externalApiTimeout)} error={errorFor('security.externalApiTimeout')} onCommit={(value) => applyPatch({ security: { externalApiTimeout: Number(value) } })} />
          <DraftField label="Response selector" value={settings.security.externalApiSelector} placeholder="result.invoice.vendor" onCommit={(externalApiSelector) => applyPatch({ security: { externalApiSelector } })} />
          <DraftTextarea
            label="Headers JSON"
            value=""
            rows={4}
            sensitive
            configured={settings.security.externalApiHeaders.configured}
            error={errorFor('security.externalApiHeaders')}
            onCommit={(externalApiHeaders) => applyPatch({ security: { externalApiHeaders } })}
          />
          <DraftTextarea
            label="Body JSON"
            value=""
            rows={4}
            sensitive
            configured={settings.security.externalApiBody.configured}
            error={errorFor('security.externalApiBody')}
            onCommit={(externalApiBody) => applyPatch({ security: { externalApiBody } })}
          />
        </SettingsSection>

        <SettingsSection title="Privacy">
          <SettingsRow title="Anonymous telemetry" description="A minimal heartbeat without document content.">
            <div className="set-actions">
              {!settings.general.telemetryAvailable
                ? <span className="meta">Collector not configured</span>
                : null}
              <SettingSwitch
                checked={settings.general.telemetryEnabled}
                disabled={!settings.general.telemetryAvailable}
                label="Anonymous telemetry"
                onCheckedChange={(telemetryEnabled) => void applyPatch({ general: { telemetryEnabled } })}
              />
            </div>
          </SettingsRow>
        </SettingsSection>
      </> : null}
    </>;
  })();

  return <div className="page-column is-wide set-page">
    <header className="page-header"><h1 className="page-title">Settings</h1></header>
    <div className="set-layout">
      <div className="set-side">
        <nav className="set-nav" aria-label="Settings sections">
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
        <p className="set-version">Tagvico v{settings.diagnostics.version}</p>
      </div>
      <div className="set-content">{content}</div>
    </div>
    {toast ? <div className={`set-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div> : null}
  </div>;
}
