'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Bug,
  FileStack,
  LockKeyhole,
  SlidersHorizontal,
  Tags,
  UsersRound
} from 'lucide-react';
import { DraftField } from './draft-field';
import { DraftTextarea } from './draft-textarea';
import { CustomFieldsEditor } from './custom-fields-editor';
import { HouseholdSettings, type HouseholdMember } from './household-settings';
import { InlineStatus } from './inline-status';
import { MfaSettings } from './mfa-settings';
import { ModelPicker } from './model-picker';
import { PaperlessDiscovery } from './paperless-discovery';
import { SettingSwitch } from './setting-switch';
import { SettingsRow, SettingsSection } from './settings-section';
import { TagGroupCard } from './tag-group-card';
import { TagUnification } from './tag-unification';
import type {
  ModelDescriptor,
  SettingsResponse,
  SettingsSectionId,
  TagGroup
} from './types';

const sections = [
  { id: 'paperless', label: 'Paperless', Icon: FileStack },
  { id: 'providers', label: 'AI models', Icon: Bot },
  { id: 'automation', label: 'Automation', Icon: SlidersHorizontal },
  { id: 'tags', label: 'Tag library', Icon: Tags },
  { id: 'general', label: 'Household', Icon: UsersRound },
  { id: 'security', label: 'Security & privacy', Icon: LockKeyhole },
  { id: 'diagnostics', label: 'Diagnostics', Icon: Bug }
] as const;

const headings: Record<SettingsSectionId, { eyebrow: string; title: string; description: string }> = {
  general: {
    eyebrow: 'People and preferences',
    title: 'Household',
    description: 'Profiles, Paperless access and local interface preferences.'
  },
  paperless: {
    eyebrow: 'Connection',
    title: 'Paperless-ngx',
    description: 'The source of documents, permissions and filing vocabulary.'
  },
  providers: {
    eyebrow: 'Intelligence',
    title: 'AI models',
    description: 'Runtime-discovered models, per-model capabilities and one consistent inference contract.'
  },
  automation: {
    eyebrow: 'Workflow',
    title: 'Automation',
    description: 'Control when Tagvico processes documents and which execution mode it uses.'
  },
  tags: {
    eyebrow: 'Vocabulary',
    title: 'Tag library',
    description: 'Control the vocabulary, clean up duplicates and define safe metadata boundaries.'
  },
  security: {
    eyebrow: 'Boundaries',
    title: 'Security & privacy',
    description: 'External access remains opt-in and secrets remain write-only.'
  },
  diagnostics: {
    eyebrow: 'Runtime',
    title: 'Diagnostics',
    description: 'A redacted view of this installation and its capability registry.'
  }
};

type HouseholdProps = {
  currentMemberId: string;
  currentRole: string;
  householdKind: string;
  members: HouseholdMember[];
};

type Toast = { kind: 'success' | 'error'; message: string } | null;

export function SettingsWorkspace({
  section,
  initialSettings,
  household
}: {
  section: SettingsSectionId;
  initialSettings: SettingsResponse;
  household: HouseholdProps;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const settingsRef = useRef(initialSettings);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const toastTimer = useRef<number | null>(null);
  const codexPollTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelDescriptor[]>>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [probeStatus, setProbeStatus] = useState('');
  const [codexLogin, setCodexLogin] = useState('');
  const [codexLoginOutput, setCodexLoginOutput] = useState('');
  const [copilotLogin, setCopilotLogin] = useState('');
  const [copilotChallenge, setCopilotChallenge] = useState<{ verificationUrl?: string; userCode?: string }>({});
  const [providerAuth, setProviderAuth] = useState<{ loading: boolean; authenticated: boolean; label: string }>({
    loading: false,
    authenticated: false,
    label: ''
  });
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
        throw new Error(body.error || 'Could not save settings.');
      }
      settingsRef.current = body;
      setSettings(body);
      showMessage('success', successMessage);
      return body as SettingsResponse;
    });
    const handledOperation = operation.catch((error) => {
      showMessage('error', error instanceof Error ? error.message : 'Could not save settings.');
      return null;
    });
    mutationQueue.current = handledOperation;
    return handledOperation;
  };

  const activeProvider = settings.ai.providers.find(
    (provider) => provider.instanceId === settings.ai.activeProviderInstanceId
  );
  const activeModels = modelsByProvider[settings.ai.activeProviderInstanceId] || [];
  const activeModel = activeModels.find((model) => model.id === settings.ai.activeModelId);

  const loadModels = async (instanceId = settingsRef.current.ai.activeProviderInstanceId) => {
    setModelsLoading(true);
    setModelsError('');
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(instanceId)}/models`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load models.');
      setModelsByProvider((current) => ({ ...current, [instanceId]: body.models || [] }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load models.';
      setModelsError(message);
    } finally {
      setModelsLoading(false);
    }
  };

  const selectProvider = async (instanceId: string) => {
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

  const probeProvider = async () => {
    const instanceId = settingsRef.current.ai.activeProviderInstanceId;
    setProbeStatus('Checking connection…');
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(instanceId)}/probe`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Provider probe failed.');
      setProbeStatus(`Connected in ${body.latencyMs} ms · ${body.models} live models`);
      showMessage('success', `${activeProvider?.name || instanceId} is reachable.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider probe failed.';
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
    if (!['codex', 'copilot'].includes(providerId)) {
      setProviderAuth({ loading: false, authenticated: false, label: '' });
      return;
    }
    setProviderAuth((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch(`/api/${providerId}/status`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      const authenticated = body.authenticated === true;
      const plan = providerId === 'codex' && body.account?.planType ? ` · ${body.account.planType}` : '';
      setProviderAuth({
        loading: false,
        authenticated,
        label: authenticated ? `Connected${plan}` : 'Not connected'
      });
    } catch {
      setProviderAuth({ loading: false, authenticated: false, label: 'Status unavailable' });
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

  const logoutProvider = async (providerId: 'codex' | 'copilot') => {
    try {
      const response = await fetch(`/api/${providerId}/logout`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not sign out.');
      await loadProviderAuth(providerId);
      showMessage('success', `${providerId === 'codex' ? 'ChatGPT' : 'GitHub Copilot'} signed out.`);
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
    void loadProviderAuth(settings.ai.activeProviderInstanceId);
    // The selected provider is the only setting that changes which account session is relevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ai.activeProviderInstanceId]);

  const content = (() => {
    if (section === 'general') {
      return <>
        <SettingsSection title="Product preferences" description="Local interface state stays in this browser; operational settings stay on the server.">
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
          <SettingsRow title="Sidebar" description="Collapsed or expanded state is stored only in this browser.">
            <span className="settings-badge">Local preference</span>
          </SettingsRow>
        </SettingsSection>
        <HouseholdSettings {...household} onMessage={showMessage} />
      </>;
    }
    if (section === 'paperless') {
      return <>
        <SettingsSection title="Paperless connection" description="The token is write-only. Leaving the field empty retains the existing token.">
          <SettingsRow title="Connection details" description="Use the base URL only; Tagvico adds API paths itself." stack>
            <div className="settings-fields-grid">
              <DraftField
                label="Base URL"
                type="url"
                value={settings.paperless.baseUrl}
                placeholder="http://paperless:8000"
                onCommit={(baseUrl) => applyPatch({ paperless: { baseUrl } })}
              />
              <DraftField
                label="Paperless username"
                value={settings.paperless.username}
                onCommit={(username) => applyPatch({ paperless: { username } })}
              />
              <DraftField
                label="API token"
                type="password"
                value=""
                configured={settings.paperless.token.configured}
                onCommit={(token) => applyPatch({ paperless: { token } })}
              />
            </div>
          </SettingsRow>
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
      </>;
    }
    if (section === 'providers') {
      return <>
        <SettingsSection title="Active runtime" description="Models and their thinking options are discovered from the runtime, not invented in Tagvico.">
          <SettingsRow title="Provider and model" description="Search live models, favorite frequent choices and inspect capabilities." stack>
            <ModelPicker
              providers={settings.ai.providers}
              activeProviderId={settings.ai.activeProviderInstanceId}
              activeModelId={settings.ai.activeModelId}
              models={activeModels}
              loading={modelsLoading}
              error={modelsError}
              onProviderChange={selectProvider}
              onRefresh={() => loadModels()}
              onSelect={selectModel}
            />
            {activeProvider?.manualModelInput ? <DraftField
              label="Manual model ID"
              description="Use this only when the provider has no catalog or a new model is not listed yet."
              value={settings.ai.activeModelId}
              placeholder="provider/model-id"
              onCommit={(activeModelId) => applyPatch({ ai: { activeModelId } }, 'Model ID saved.')}
            /> : null}
            {activeModel?.options.map((option) => option.type === 'select' ? <label className="settings-field" key={option.id}>
              <span className="settings-field-label">{option.label}<small>Runtime capability</small></span>
              <select
                className="settings-select"
                value={String(settings.ai.modelOptions[option.id] ?? option.defaultValue ?? option.values[0]?.id ?? '')}
                onChange={(event) => void applyPatch({
                  ai: { modelOptions: { [option.id]: event.target.value } }
                }, `${option.label} saved.`)}
              >
                {option.values.map((value) => <option value={value.id} key={value.id}>{value.label}</option>)}
              </select>
              {option.description ? <span className="settings-field-help">{option.description}</span> : null}
            </label> : null)}
            {!activeModel && !modelsLoading ? <InlineStatus kind="neutral">
              Load the live catalog to reveal model-specific options such as thinking effort.
            </InlineStatus> : null}
          </SettingsRow>
        </SettingsSection>

        {activeProvider ? <SettingsSection title={`${activeProvider.name} connection`} description={activeProvider.description}>
          {activeProvider.fields.length ? <SettingsRow title="Provider configuration" description="Fields are generated from the provider schema." stack>
            <div className="settings-fields-grid">
              {activeProvider.fields.map((field) => {
                const stored = activeProvider.configuration[field.key];
                return <DraftField
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  type={field.type}
                  value={typeof stored === 'string' ? stored : ''}
                  configured={typeof stored === 'object' && stored.configured}
                  placeholder={field.placeholder}
                  onCommit={(value) => applyPatch({
                    provider: { instanceId: activeProvider.instanceId, values: { [field.key]: value } }
                  }, `${field.label} saved.`)}
                />;
              })}
            </div>
          </SettingsRow> : null}
          {activeProvider.instanceId === 'codex' ? <SettingsRow
            title="ChatGPT account"
            description="The official Codex runtime owns the account session and reports Luna, Terra, Sol and their capabilities when available."
            stack
          >
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
          </SettingsRow> : null}
          {activeProvider.instanceId === 'copilot' ? <SettingsRow
            title="GitHub Copilot account"
            description="Use the Copilot device flow, then load the models available to that account."
            stack
          >
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
          </SettingsRow> : null}
          <SettingsRow title="Connection probe" description="Checks authentication and model discovery without changing the selected model.">
            <div className="settings-action-cluster">
              <button className="settings-button" type="button" onClick={() => void probeProvider()}>Test connection</button>
              {probeStatus ? <InlineStatus kind={probeStatus.startsWith('Connected') ? 'success' : probeStatus.includes('…') ? 'loading' : 'error'}>{probeStatus}</InlineStatus> : null}
            </div>
          </SettingsRow>
        </SettingsSection> : null}
      </>;
    }
    if (section === 'automation') {
      return <><SettingsSection title="Processing schedule" description="Changes are persisted only on blur, Enter or an explicit switch action.">
        <SettingsRow title="Scan interval" description="Cron syntax. The default runs every 30 minutes.">
          <DraftField
            label="Cron expression"
            value={settings.automation.scanInterval}
            onCommit={(scanInterval) => applyPatch({ automation: { scanInterval } })}
          />
        </SettingsRow>
        <SettingsRow title="Automatic processing" description="Process new documents on the configured schedule.">
          <SettingSwitch
            checked={settings.automation.automaticProcessing}
            label="Automatic processing"
            onCheckedChange={(automaticProcessing) => void applyPatch({ automation: { automaticProcessing } })}
          />
        </SettingsRow>
        <SettingsRow title="Require trigger tags" description="When enabled, automatic processing considers only documents carrying one of the trigger tags configured in Tag library.">
          <SettingSwitch
            checked={settings.automation.processPredefinedDocuments}
            label="Require trigger tags"
            onCheckedChange={(processPredefinedDocuments) => void applyPatch({ automation: { processPredefinedDocuments } })}
          />
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
      <SettingsSection title="Metadata behavior" description="Decide which existing information the model may reuse and which fields it may propose.">
        <SettingsRow title="Reuse existing metadata" description="Include existing tags, correspondent and document type as context instead of starting from an empty record.">
          <SettingSwitch
            checked={settings.automation.useExistingData}
            label="Reuse existing metadata"
            onCheckedChange={(useExistingData) => void applyPatch({ automation: { useExistingData } })}
          />
        </SettingsRow>
        <SettingsRow title="Custom fields" description="Let the model populate the explicit custom-field definitions configured under Security & privacy.">
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
          <SettingsRow title="Maximum tags per document" description="Keep the filing result focused.">
            <DraftField
              label="Maximum"
              type="number"
              value={String(settings.tags.maximumPerDocument)}
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
          description="Use one of your configured live models to find likely duplicates, then approve every merge separately."
        >
          <SettingsRow
            title="Review-first tag cleanup"
            description="The AI can propose pairs only. Document moves and deletion remain explicit, separate and auditable."
            stack
          >
            <TagUnification
              providers={settings.ai.providers}
              activeProviderId={settings.ai.activeProviderInstanceId}
              activeModelId={settings.ai.activeModelId}
            />
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
              onCommit={(processedTagName) => applyPatch({ tags: { processedTagName } }, 'Processed tag name saved.')}
            />
          </SettingsRow>
          <SettingsRow title="Trigger tags" description="When configured, only documents carrying one of these comma-separated tags enter automatic processing.">
            <DraftField
              label="Tags"
              value={settings.tags.triggerTags.join(', ')}
              placeholder="todo-ai, inbox-ai"
              onCommit={(value) => applyPatch({ tags: { triggerTags: value.split(',').map((tag) => tag.trim()).filter(Boolean) } }, 'Trigger tags saved.')}
            />
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
    if (section === 'security') {
      return <><SettingsSection title="Local API authentication" description="This write-only key protects authenticated Tagvico API requests; it is separate from outbound enrichment.">
        <SettingsRow title="Tagvico API key" description="Use at least 32 characters. Leaving this empty retains the configured key." stack>
          <DraftField
            label="Tagvico API key"
            type="password"
            value=""
            configured={settings.security.apiKey.configured}
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
            <DraftField label="URL" type="url" value={settings.security.externalApiUrl} placeholder="https://api.example.com/lookup" onCommit={(externalApiUrl) => applyPatch({ security: { externalApiUrl } })} />
            <label className="settings-field">
              <span className="settings-field-label">Method</span>
              <select className="settings-select" value={settings.security.externalApiMethod} onChange={(event) => void applyPatch({ security: { externalApiMethod: event.target.value } })}>
                <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
              </select>
            </label>
            <DraftField label="Timeout (ms)" type="number" value={String(settings.security.externalApiTimeout)} onCommit={(value) => applyPatch({ security: { externalApiTimeout: Number(value) } })} />
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
              onCommit={(externalApiHeaders) => applyPatch({ security: { externalApiHeaders } })}
            />
            <DraftTextarea
              label="Body JSON"
              value=""
              rows={6}
              sensitive
              configured={settings.security.externalApiBody.configured}
              onCommit={(externalApiBody) => applyPatch({ security: { externalApiBody } })}
            />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Paperless custom fields" description="Only fields listed here may be proposed by the model.">
        <SettingsRow title="Allowed fields" description="Names and types must match your Paperless custom-field setup." stack>
          <CustomFieldsEditor fields={settings.security.customFields} onChange={(customFields) => applyPatch({ security: { customFields } }, 'Custom fields saved.')} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Multi-factor authentication" description="Protect this Tagvico account with a TOTP authenticator.">
        <SettingsRow title="Authenticator app" description="Setup secrets expire after ten minutes and are shown only during enrollment." stack>
          <MfaSettings />
        </SettingsRow>
      </SettingsSection></>;
    }
    return <SettingsSection title="Installation snapshot" description="This view intentionally contains no tokens, account IDs or private credential values.">
      <dl className="settings-diagnostics">
        <div><dt>Tagvico version</dt><dd>{settings.diagnostics.version}</dd></div>
        <div><dt>Setup complete</dt><dd>{settings.diagnostics.configured ? 'Yes' : 'No'}</dd></div>
        <div><dt>Provider definitions</dt><dd>{settings.diagnostics.providerRegistrySize}</dd></div>
        <div><dt>Active provider</dt><dd>{settings.ai.activeProviderInstanceId}</dd></div>
        <div><dt>Active model</dt><dd>{settings.ai.activeModelId || 'Not configured'}</dd></div>
        <div><dt>Settings revision</dt><dd><code>{settings.revision}</code></dd></div>
      </dl>
    </SettingsSection>;
  })();

  const heading = headings[section];
  return <div className="settings-page">
    <header className="settings-page-head">
      <div>
        <p className="eyebrow">{heading.eyebrow}</p>
        <h1>{heading.title}</h1>
        <p>{heading.description}</p>
      </div>
      <span className="settings-version">v{settings.diagnostics.version}</span>
    </header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map(({ id, label, Icon }) => <Link
          key={id}
          href={`/settings/${id}`}
          className={section === id ? 'is-active' : undefined}
          aria-current={section === id ? 'page' : undefined}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </Link>)}
      </nav>
      <div className="settings-content">{content}</div>
    </div>
    {toast ? <div className={`settings-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div> : null}
  </div>;
}
