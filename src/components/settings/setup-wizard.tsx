'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileStack, KeyRound, Sparkles } from 'lucide-react';
import { ChatGPTPlanSignIn } from './chatgpt-plan-sign-in';
import { InlineStatus } from './inline-status';
import { PaperlessDiscovery } from './paperless-discovery';
import { SettingsRow, SettingsSection } from './settings-section';
import type { ProviderDescriptor } from './types';

type SetupState = {
  paperlessUrl: string;
  paperlessToken: string;
  paperlessUsername: string;
  providerId: string;
  modelId: string;
  providerValues: Record<string, string>;
  username: string;
  password: string;
  confirmPassword: string;
};

type SetupStatus = {
  kind: 'loading' | 'error' | 'success' | 'neutral';
  message: string;
} | null;

type SetupModel = {
  id: string;
  name: string;
  isDefault?: boolean;
  capabilities?: string[];
};

const DRAFT_KEY = 'tagvicoSetupDraftV3';

function providerDefaults(provider: ProviderDescriptor | undefined) {
  return Object.fromEntries((provider?.fields || []).flatMap((field) => (
    field.defaultValue ? [[field.key, field.defaultValue]] : []
  )));
}

function initialState(providers: ProviderDescriptor[]): SetupState {
  const provider = providers.find((candidate) => candidate.recommended) || providers[0];
  return {
    paperlessUrl: '',
    paperlessToken: '',
    paperlessUsername: '',
    providerId: provider?.instanceId || 'openrouter',
    modelId: '',
    providerValues: providerDefaults(provider),
    username: 'admin',
    password: '',
    confirmPassword: ''
  };
}

export function SetupWizard({ providers }: { providers: ProviderDescriptor[] }) {
  const router = useRouter();
  const [state, setState] = useState<SetupState>(() => initialState(providers));
  const [step, setStep] = useState(0);
  const [models, setModels] = useState<SetupModel[]>([]);
  const [verifiedModelId, setVerifiedModelId] = useState('');
  const [status, setStatus] = useState<SetupStatus>(null);
  const [hydrated, setHydrated] = useState(false);
  const [codexLoginId, setCodexLoginId] = useState('');
  const [chatgptConnected, setChatgptConnected] = useState(false);
  const [codexLoginOutput, setCodexLoginOutput] = useState('');
  const codexPollTimer = useRef<number | null>(null);
  const providerProbeId = useRef(0);
  const provider = providers.find((candidate) => candidate.instanceId === state.providerId);
  const visibleProviders = useMemo(() => providers.filter((candidate) => candidate.available), [providers]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') as Partial<SetupState>;
      const savedProvider = providers.find((candidate) => candidate.instanceId === saved.providerId)
        || providers.find((candidate) => candidate.recommended)
        || providers[0];
      if (Object.keys(saved).length) {
        setState((current) => ({
          ...current,
          paperlessUrl: String(saved.paperlessUrl || ''),
          paperlessUsername: String(saved.paperlessUsername || ''),
          providerId: savedProvider?.instanceId || current.providerId,
          modelId: String(saved.modelId || ''),
          providerValues: {
            ...providerDefaults(savedProvider),
            ...(saved.providerValues && typeof saved.providerValues === 'object' ? saved.providerValues : {})
          },
          username: String(saved.username || current.username)
        }));
        setStatus({
          kind: 'neutral',
          message: 'Restored non-secret fields for this tab. Re-enter tokens and passwords before continuing.'
        });
      }
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } finally {
      setHydrated(true);
    }
  }, [providers]);

  useEffect(() => {
    if (!hydrated) return;
    const publicProviderValues = Object.fromEntries(
      Object.entries(state.providerValues).filter(([key]) => !provider?.fields.find((field) => field.key === key)?.secret)
    );
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      paperlessUrl: state.paperlessUrl,
      paperlessUsername: state.paperlessUsername,
      providerId: state.providerId,
      modelId: state.modelId,
      providerValues: publicProviderValues,
      username: state.username
    }));
  }, [
    hydrated,
    provider,
    state.modelId,
    state.paperlessUrl,
    state.paperlessUsername,
    state.providerId,
    state.providerValues,
    state.username
  ]);

  useEffect(() => () => {
    if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
  }, []);

  const update = (key: keyof SetupState, value: string | Record<string, string>) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const updateProviderValue = (key: string, value: string) => {
    if (state.providerValues[key] === value) return;
    providerProbeId.current += 1;
    setModels([]);
    setVerifiedModelId('');
    setState((current) => ({
      ...current,
      modelId: '',
      providerValues: {
        ...current.providerValues,
        [key]: value
      }
    }));
    setStatus({
      kind: 'neutral',
      message: 'Connection details changed. Check the runtime again before continuing.'
    });
  };

  const updateModelId = (modelId: string) => {
    if (state.modelId === modelId) return;
    providerProbeId.current += 1;
    setVerifiedModelId('');
    update('modelId', modelId);
    setStatus({
      kind: 'neutral',
      message: modelId
        ? 'Model changed. Check the runtime again to verify this exact model.'
        : 'Choose or enter a model, then check the runtime.'
    });
  };

  const useDiscoveredPaperless = (url: string) => {
    update('paperlessUrl', url);
    setStatus({
      kind: 'neutral',
      message: `Using ${url}. Add an API token, then check Paperless.`
    });
  };

  const checkPaperless = async () => {
    if (!state.paperlessUrl.trim() || !state.paperlessToken.trim()) {
      setStatus({ kind: 'error', message: 'Enter the Paperless base URL and an API token first.' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Checking Paperless access and required read permissions…' });
    try {
      const response = await fetch('/api/paperless/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: state.paperlessUrl, token: state.paperlessToken })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success !== true) {
        throw new Error(body.instance?.error || body.error || 'Paperless could not be verified.');
      }
      setStep(1);
      setStatus({ kind: 'success', message: 'Paperless is reachable and the token has the required read permissions.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Paperless could not be verified.'
      });
    }
  };

  const checkProvider = async () => {
    if (!provider) {
      setStatus({ kind: 'error', message: 'Choose an available AI runtime.' });
      return;
    }
    const missing = provider.fields.find((field) => field.required && !state.providerValues[field.key]?.trim());
    if (missing) {
      setStatus({ kind: 'error', message: `Enter ${missing.label.toLowerCase()} before checking the runtime.` });
      return;
    }
    const probeId = ++providerProbeId.current;
    setVerifiedModelId('');
    setStatus({
      kind: 'loading',
      message: state.modelId.trim()
        ? 'Checking the runtime and verifying the selected chat model…'
        : 'Checking the runtime and loading its model catalog…'
    });
    try {
      const response = await fetch('/api/setup/v3/provider-probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: state.providerId,
          values: state.providerValues,
          ...(state.modelId.trim() ? { modelId: state.modelId.trim() } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (probeId !== providerProbeId.current) return;
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error || 'The AI runtime could not be verified.');
      }
      const discovered = Array.isArray(body.models) ? body.models as SetupModel[] : [];
      setModels(discovered);
      const validatedModelId = typeof body.validatedModelId === 'string' ? body.validatedModelId : '';
      setVerifiedModelId(validatedModelId);
      if (validatedModelId) {
        setState((current) => ({ ...current, modelId: validatedModelId }));
        setStatus({
          kind: 'success',
          message: body.validationMode === 'tool'
            ? 'Runtime and selected model verified with a safe test tool call. You can continue.'
            : 'Runtime account and selected model verified in its live catalog. You can continue.'
        });
      } else {
        setStatus({
          kind: 'neutral',
          message: `Runtime connected. Choose from ${discovered.length} model${discovered.length === 1 ? '' : 's'}, then check that model.`
        });
      }
    } catch (error) {
      if (probeId !== providerProbeId.current) return;
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'The AI runtime could not be verified.'
      });
    }
  };

  const stopCodexPolling = () => {
    if (codexPollTimer.current !== null) window.clearInterval(codexPollTimer.current);
    codexPollTimer.current = null;
  };

  const pollCodexLogin = (loginId: string) => {
    stopCodexPolling();
    const deadline = Date.now() + 5 * 60 * 1000;
    codexPollTimer.current = window.setInterval(async () => {
      if (Date.now() > deadline) {
        stopCodexPolling();
        await fetch(`/api/setup/v3/codex/login/${encodeURIComponent(loginId)}/cancel`, {
          method: 'POST'
        }).catch(() => undefined);
        setCodexLoginId('');
        setStatus({ kind: 'error', message: 'ChatGPT sign-in timed out. Start a new device sign-in.' });
        return;
      }
      try {
        const response = await fetch(`/api/setup/v3/codex/login/${encodeURIComponent(loginId)}`, {
          cache: 'no-store'
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not check ChatGPT sign-in.');
        setCodexLoginOutput(body.output || body.error || 'Waiting for sign-in…');
        if (body.completed) {
          stopCodexPolling();
          setCodexLoginId('');
          if (body.error) throw new Error(body.error);
          providerProbeId.current += 1;
          setModels([]);
          setVerifiedModelId('');
          setState((current) => ({ ...current, modelId: '' }));
          setCodexLoginOutput('ChatGPT sign-in completed. The account token stays in Tagvico data.');
          setStatus({ kind: 'success', message: 'ChatGPT is connected. Check the runtime to load its live models.' });
        }
      } catch (error) {
        stopCodexPolling();
        setCodexLoginId('');
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not complete ChatGPT sign-in.'
        });
      }
    }, 1200);
  };

  const startCodexLogin = async () => {
    providerProbeId.current += 1;
    setModels([]);
    setVerifiedModelId('');
    setState((current) => ({ ...current, modelId: '' }));
    setStatus({ kind: 'loading', message: 'Starting secure ChatGPT device sign-in…' });
    try {
      const response = await fetch('/api/setup/v3/codex/login', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not start ChatGPT sign-in.');
      setCodexLoginId(body.loginId);
      setCodexLoginOutput(body.output || 'Starting secure device sign-in…');
      setStatus({
        kind: 'neutral',
        message: 'Open the verification URL shown below, enter the one-time code, then return to this tab.'
      });
      pollCodexLogin(body.loginId);
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not start ChatGPT sign-in.'
      });
    }
  };

  const cancelCodexLogin = async () => {
    const loginId = codexLoginId;
    stopCodexPolling();
    setCodexLoginId('');
    if (!loginId) return;
    await fetch(`/api/setup/v3/codex/login/${encodeURIComponent(loginId)}/cancel`, {
      method: 'POST'
    }).catch(() => undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 2) return;
    if (state.password !== state.confirmPassword) {
      setStatus({ kind: 'error', message: 'Passwords do not match.' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Creating the owner account and saving the verified connections…' });
    try {
      const response = await fetch('/api/setup/v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperless: {
            baseUrl: state.paperlessUrl,
            token: state.paperlessToken,
            username: state.paperlessUsername
          },
          provider: {
            instanceId: state.providerId,
            modelId: state.modelId,
            values: state.providerValues
          },
          account: {
            username: state.username,
            password: state.password,
            confirmPassword: state.confirmPassword
          }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Setup could not be completed.');
      window.sessionStorage.removeItem(DRAFT_KEY);
      setStatus({ kind: 'success', message: 'Setup complete. Opening sign in…' });
      router.push('/login?setup=success');
      router.refresh();
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Setup could not be completed.' });
    }
  };

  const changeProvider = (providerId: string) => {
    if (state.providerId === 'codex' && codexLoginId) void cancelCodexLogin();
    const nextProvider = providers.find((candidate) => candidate.instanceId === providerId);
    providerProbeId.current += 1;
    setModels([]);
    setVerifiedModelId('');
    setState((current) => ({
      ...current,
      providerId,
      modelId: '',
      providerValues: providerDefaults(nextProvider)
    }));
    setStatus(null);
  };

  return <form className="setup-wizard" onSubmit={submit}>
    <div className="setup-progress" aria-label="Setup steps">
      {[
        { label: 'Paperless', Icon: FileStack },
        { label: 'AI runtime', Icon: Sparkles },
        { label: 'Owner & safety', Icon: KeyRound }
      ].map(({ label, Icon }, index) => <span
        key={label}
        className={index === step ? 'is-active' : index < step ? 'is-complete' : undefined}
        aria-current={index === step ? 'step' : undefined}
      >
        {index < step ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
        {label}
      </span>)}
    </div>

    {step === 0 ? <SettingsSection
      title="1. Connect Paperless-ngx"
      description="Tagvico checks the URL, token and required read permissions now, before anything is saved."
    >
      <SettingsRow
        title="Paperless connection"
        description="Use the base URL without /api. The token stays in this request and is never echoed back."
        stack
      >
        <div className="settings-fields-grid">
          <label className="settings-field">
            <span className="settings-field-label">Base URL</span>
            <input
              className="settings-input"
              type="url"
              required
              value={state.paperlessUrl}
              onChange={(event) => update('paperlessUrl', event.target.value)}
              placeholder="http://paperless:8000"
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">API token</span>
            <input
              className="settings-input"
              type="password"
              autoComplete="new-password"
              required
              value={state.paperlessToken}
              onChange={(event) => update('paperlessToken', event.target.value)}
            />
            <span className="settings-field-help">Create this in Paperless under My Profile. Tagvico verifies document and metadata access.</span>
          </label>
          <label className="settings-field">
            <span className="settings-field-label">Paperless username <small>(optional)</small></span>
            <input
              className="settings-input"
              value={state.paperlessUsername}
              onChange={(event) => update('paperlessUsername', event.target.value)}
              placeholder="Only needed for owner assignment"
            />
          </label>
        </div>
      </SettingsRow>
      <SettingsRow
        title="Find Paperless-ngx"
        description="Not sure about the address? Scan common Docker, host and local-network addresses. Discovery is read-only and only fills the Base URL when you pick a result."
        stack
      >
        <PaperlessDiscovery
          baseUrl={state.paperlessUrl}
          endpoint="/api/paperless/discover"
          onSelect={useDiscoveredPaperless}
        />
      </SettingsRow>
    </SettingsSection> : null}

    {step === 1 ? <SettingsSection
      title="2. Choose an AI runtime"
      description="Tagvico loads the live catalog when available, accepts an exact model ID when needed, and verifies the selected chat model."
    >
      <SettingsRow title="Provider" description={provider?.description}>
        <select
          className="settings-select"
          value={state.providerId}
          disabled={status?.kind === 'loading'}
          onChange={(event) => changeProvider(event.target.value)}
        >
          {visibleProviders.map((candidate) => <option key={candidate.instanceId} value={candidate.instanceId}>
            {candidate.name}{candidate.recommended ? ' (recommended)' : ''}
          </option>)}
        </select>
      </SettingsRow>
      {provider?.fields.length ? <SettingsRow
        title="Connection"
        description="Built-in endpoint defaults are prefilled. Secrets are stored only in Tagvico data."
        stack
      >
        <div className="settings-fields-grid">
          {provider.fields.map((field) => <label className="settings-field" key={field.key}>
            <span className="settings-field-label">{field.label}</span>
            <input
              className="settings-input"
              type={field.type}
              required={field.required}
              autoComplete={field.secret ? 'new-password' : 'off'}
              disabled={status?.kind === 'loading'}
              placeholder={field.placeholder}
              value={state.providerValues[field.key] || ''}
              onChange={(event) => updateProviderValue(field.key, event.target.value)}
            />
            {field.description ? <span className="settings-field-help">{field.description}</span> : null}
          </label>)}
        </div>
      </SettingsRow> : null}
      {provider?.instanceId === 'chatgpt' ? <SettingsRow
        title="ChatGPT account"
        description="Sign in with ChatGPT so an eligible Plus or Pro plan pays for filing and the Companion. No API key is needed."
        stack
      >
        <ChatGPTPlanSignIn
          apiBase="/api/setup/v3/chatgpt"
          authenticated={chatgptConnected}
          onConnected={() => {
            providerProbeId.current += 1;
            setChatgptConnected(true);
            setModels([]);
            setVerifiedModelId('');
            setState((current) => ({ ...current, modelId: '' }));
            setStatus({ kind: 'success', message: 'ChatGPT is connected. Check the runtime to load the models your plan offers.' });
          }}
          onError={(message) => setStatus({ kind: 'error', message })}
        />
      </SettingsRow> : null}
      {provider?.instanceId === 'codex' ? <SettingsRow
        title="ChatGPT account"
        description="A subscription runtime needs a one-time device sign-in before Tagvico can verify its live model catalog."
        stack
      >
        <div className="settings-auth-panel">
          <div className="settings-inline-actions">
            <button
              className="settings-button"
              type="button"
              disabled={Boolean(codexLoginId)}
              onClick={() => void startCodexLogin()}
            >
              {codexLoginId ? 'Waiting for sign-in…' : 'Sign in with ChatGPT'}
            </button>
            {codexLoginId ? <button
              className="settings-button"
              type="button"
              onClick={() => void cancelCodexLogin()}
            >
              Cancel
            </button> : null}
          </div>
          {codexLoginOutput ? <pre className="settings-auth-output">{codexLoginOutput}</pre> : null}
        </div>
      </SettingsRow> : null}
      <SettingsRow
        title="Model"
        description="Catalog entries prove availability only. Tagvico verifies the exact selected model with a safe test tool call before continuing."
        stack
      >
        <div className="settings-fields-grid">
          {models.length ? <label className="settings-field">
            <span className="settings-field-label">Live model catalog</span>
            <select
              className="settings-select"
              value={models.some((model) => model.id === state.modelId) ? state.modelId : ''}
              disabled={status?.kind === 'loading'}
              onChange={(event) => updateModelId(event.target.value)}
            >
              <option value="">Choose a model</option>
              {models.map((model) => <option key={model.id} value={model.id}>
                {model.name}{model.isDefault ? ' (runtime default)' : ''}
              </option>)}
            </select>
          </label> : null}
          {provider?.manualModelInput ? <label className="settings-field">
            <span className="settings-field-label">Model ID</span>
            <input
              className="settings-input"
              value={state.modelId}
              disabled={status?.kind === 'loading'}
              onChange={(event) => updateModelId(event.target.value)}
              placeholder="Enter the exact chat model ID"
            />
            <span className="settings-field-help">Use this when the runtime has no model catalog or when you need a custom ID.</span>
          </label> : null}
          {!models.length && !provider?.manualModelInput
            ? <p className="settings-field-help">Check the runtime to load models it currently exposes.</p>
            : null}
        </div>
      </SettingsRow>
    </SettingsSection> : null}

    {step === 2 ? <SettingsSection
      title="3. Create the owner account"
      description="The safe starting point is review-first with scheduled automation paused. Ask Tagvico stays read-only until you approve a proposed change."
    >
      <SettingsRow title="Verified setup" description="Review the non-secret summary before creating the local account." stack>
        <dl className="setup-review">
          <div><dt>Paperless</dt><dd>{state.paperlessUrl}</dd></div>
          <div><dt>Runtime</dt><dd>{provider?.name || state.providerId}</dd></div>
          <div><dt>Model</dt><dd>{models.find((model) => model.id === state.modelId)?.name || state.modelId}</dd></div>
          <div><dt>Write safety</dt><dd>Review first, scheduled scans paused</dd></div>
        </dl>
      </SettingsRow>
      <SettingsRow title="Owner credentials" stack>
        <div className="settings-fields-grid">
          <label className="settings-field">
            <span className="settings-field-label">Username</span>
            <input className="settings-input" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9._-]+" autoComplete="username" value={state.username} onChange={(event) => update('username', event.target.value)} />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">Password</span>
            <input className="settings-input" required minLength={12} type="password" autoComplete="new-password" value={state.password} onChange={(event) => update('password', event.target.value)} />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">Confirm password</span>
            <input className="settings-input" required minLength={12} type="password" autoComplete="new-password" value={state.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} />
          </label>
        </div>
      </SettingsRow>
    </SettingsSection> : null}

    <div className="setup-submit">
      <div>
        {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : <p>
          Secret fields are never saved in the browser. Non-secret progress is kept only in this tab.
        </p>}
      </div>
      <div className="setup-submit-actions">
        {step > 0 ? <button className="settings-button" type="button" disabled={status?.kind === 'loading'} onClick={() => {
          if (step === 1 && codexLoginId) void cancelCodexLogin();
          setStep((current) => Math.max(0, current - 1));
          setStatus(null);
        }}>Back</button> : null}
        {step === 0 ? <button className="settings-button is-primary" type="button" disabled={status?.kind === 'loading'} onClick={() => void checkPaperless()}>
          {status?.kind === 'loading' ? 'Checking…' : 'Check Paperless'}
        </button> : null}
        {step === 1 ? <button
          className="settings-button is-primary"
          type="button"
          disabled={status?.kind === 'loading'}
          onClick={() => verifiedModelId === state.modelId.trim() && state.modelId.trim()
            ? (setStep(2), setStatus(null))
            : void checkProvider()}
        >
          {status?.kind === 'loading'
            ? 'Checking…'
            : verifiedModelId === state.modelId.trim() && state.modelId.trim()
              ? 'Continue'
              : 'Check runtime'}
        </button> : null}
        {step === 2 ? <button className="settings-button is-primary" type="submit" disabled={status?.kind === 'loading'}>
          {status?.kind === 'loading' ? 'Creating…' : 'Create owner account'}
        </button> : null}
      </div>
    </div>
  </form>;
}
