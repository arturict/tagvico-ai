'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChatGPTPlanSignIn } from './chatgpt-plan-sign-in';
import { InlineStatus } from './inline-status';
import { PaperlessDiscovery } from './paperless-discovery';
import { ProviderPicker } from './provider-picker';
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

/**
 * The model to preselect after a runtime check: GPT-6 Luna wherever the
 * catalog lists it, else the runtime's own default for the ChatGPT plan.
 */
function preferredModel(models: SetupModel[], providerId: string) {
  return models.find((model) => /(^|\/)gpt-6-luna$/i.test(model.id))
    || (providerId === 'chatgpt' ? models.find((model) => model.isDefault) : undefined);
}

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

  const checkProvider = async (modelOverride?: string) => {
    if (!provider) {
      setStatus({ kind: 'error', message: 'Choose an available AI runtime.' });
      return;
    }
    const missing = provider.fields.find((field) => field.required && !state.providerValues[field.key]?.trim());
    if (missing) {
      setStatus({ kind: 'error', message: `Enter ${missing.label.toLowerCase()} before checking the runtime.` });
      return;
    }
    const requestedModelId = (modelOverride ?? state.modelId).trim();
    const probeId = ++providerProbeId.current;
    setVerifiedModelId('');
    setStatus({
      kind: 'loading',
      message: requestedModelId
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
          ...(requestedModelId ? { modelId: requestedModelId } : {})
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
      } else if (!requestedModelId && preferredModel(discovered, state.providerId)) {
        const preselected = preferredModel(discovered, state.providerId) as SetupModel;
        setState((current) => ({ ...current, modelId: preselected.id }));
        if (state.providerId === 'chatgpt') {
          // One-click ChatGPT: verify the preselected model right away.
          await checkProvider(preselected.id);
        } else {
          setStatus({
            kind: 'neutral',
            message: `Runtime connected. ${preselected.name} is preselected; check the runtime to verify it.`
          });
        }
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

  const busy = status?.kind === 'loading';
  const modelVerified = verifiedModelId === state.modelId.trim() && Boolean(state.modelId.trim());

  return <form className="setup-wizard" onSubmit={submit}>
    <ol className="setup-steps" aria-label="Setup steps">
      {['Paperless', 'AI provider', 'Owner'].map((label, index) => <li
        key={label}
        className={index === step ? 'is-active' : undefined}
        aria-current={index === step ? 'step' : undefined}
      >
        {label}
      </li>)}
    </ol>

    {step === 0 ? <section className="auth-step" aria-labelledby="setup-step-title">
      <div className="auth-step-head">
        <h2 id="setup-step-title" className="auth-subtitle">Connect Paperless-ngx</h2>
        <p className="field-help">Tagvico checks the address and token before anything is saved.</p>
      </div>
      <label className="auth-field">
        <span className="field-label">Base URL</span>
        <input
          className="input input-40"
          type="url"
          required
          value={state.paperlessUrl}
          onChange={(event) => update('paperlessUrl', event.target.value)}
          placeholder="http://paperless:8000"
        />
        <span className="field-help">Without /api.</span>
      </label>
      <label className="auth-field">
        <span className="field-label">API token</span>
        <input
          className="input input-40"
          type="password"
          autoComplete="new-password"
          required
          value={state.paperlessToken}
          onChange={(event) => update('paperlessToken', event.target.value)}
        />
        <span className="field-help">Create it in Paperless under My Profile. It is never echoed back.</span>
      </label>
      <label className="auth-field">
        <span className="field-label">Paperless username <small>(optional)</small></span>
        <input
          className="input input-40"
          value={state.paperlessUsername}
          onChange={(event) => update('paperlessUsername', event.target.value)}
          placeholder="Only needed for owner assignment"
        />
      </label>
      <div className="auth-field">
        <span className="field-label">Not sure about the address?</span>
        <PaperlessDiscovery
          baseUrl={state.paperlessUrl}
          endpoint="/api/paperless/discover"
          onSelect={useDiscoveredPaperless}
        />
      </div>
    </section> : null}

    {step === 1 ? <section className="auth-step" aria-labelledby="setup-step-title">
      <div className="auth-step-head">
        <h2 id="setup-step-title" className="auth-subtitle">Choose an AI provider</h2>
        <p className="field-help">You can change this later in Settings.</p>
      </div>
      <ProviderPicker
        providers={providers}
        selectedId={state.providerId}
        onSelect={(providerId) => {
          if (!busy) changeProvider(providerId);
        }}
      />
      {provider?.instanceId === 'chatgpt' ? <ChatGPTPlanSignIn
        apiBase="/api/setup/v3/chatgpt"
        authenticated={chatgptConnected}
        onConnected={() => {
          providerProbeId.current += 1;
          setChatgptConnected(true);
          setModels([]);
          setVerifiedModelId('');
          setState((current) => ({ ...current, modelId: '' }));
          setStatus({ kind: 'success', message: 'ChatGPT is connected. Loading the models your plan offers…' });
          void checkProvider('');
        }}
        onError={(message) => setStatus({ kind: 'error', message })}
      /> : null}
      {provider?.fields.length ? provider.fields.map((field) => <label className="auth-field" key={field.key}>
        <span className="field-label">{field.label}</span>
        <input
          className="input input-40"
          type={field.type}
          required={field.required}
          autoComplete={field.secret ? 'new-password' : 'off'}
          disabled={busy}
          placeholder={field.placeholder}
          value={state.providerValues[field.key] || ''}
          onChange={(event) => updateProviderValue(field.key, event.target.value)}
        />
        {field.description ? <span className="field-help">{field.description}</span> : null}
      </label>) : null}
      {provider?.instanceId === 'codex' ? <div className="auth-field">
        <span className="field-label">ChatGPT account</span>
        <span className="field-help">A one-time device sign-in lets Tagvico verify the live model catalog.</span>
        <div className="set-actions is-start">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={Boolean(codexLoginId)}
            onClick={() => void startCodexLogin()}
          >
            {codexLoginId ? 'Waiting for sign-in…' : 'Sign in with ChatGPT'}
          </button>
          {codexLoginId ? <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void cancelCodexLogin()}
          >
            Cancel
          </button> : null}
        </div>
        {codexLoginOutput ? <pre className="set-auth-output">{codexLoginOutput}</pre> : null}
      </div> : null}
      {models.length ? <label className="auth-field">
        <span className="field-label">Live model catalog</span>
        <select
          className="select select-40"
          value={models.some((model) => model.id === state.modelId) ? state.modelId : ''}
          disabled={busy}
          onChange={(event) => updateModelId(event.target.value)}
        >
          <option value="">Choose a model</option>
          {models.map((model) => <option key={model.id} value={model.id}>
            {model.name}{/(^|\/)gpt-6-luna$/i.test(model.id) ? ' (recommended)' : model.isDefault ? ' (runtime default)' : ''}
          </option>)}
        </select>
      </label> : null}
      {provider?.manualModelInput ? <label className="auth-field">
        <span className="field-label">Model ID</span>
        <input
          className="input input-40"
          value={state.modelId}
          disabled={busy}
          onChange={(event) => updateModelId(event.target.value)}
          placeholder="Enter the exact chat model ID"
        />
        <span className="field-help">For runtimes without a model catalog, or a custom ID.</span>
      </label> : null}
      {!models.length && !provider?.manualModelInput
        ? <p className="field-help">Check the runtime to load the models it offers.</p>
        : null}
      <p className="field-help">Catalog entries prove availability only. Tagvico verifies the exact selected model with a safe test tool call before continuing.</p>
    </section> : null}

    {step === 2 ? <section className="auth-step" aria-labelledby="setup-step-title">
      <h2 id="setup-step-title" className="auth-subtitle">Create the owner account</h2>
      <dl className="setup-review">
        <div><dt>Paperless</dt><dd>{state.paperlessUrl}</dd></div>
        <div><dt>Provider</dt><dd>{provider?.name || state.providerId}</dd></div>
        <div><dt>Model</dt><dd>{models.find((model) => model.id === state.modelId)?.name || state.modelId}</dd></div>
        <div><dt>Writes</dt><dd>Review first, scheduled scans paused</dd></div>
      </dl>
      <label className="auth-field">
        <span className="field-label">Username</span>
        <input className="input input-40" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9._-]+" autoComplete="username" value={state.username} onChange={(event) => update('username', event.target.value)} />
      </label>
      <label className="auth-field">
        <span className="field-label">Password</span>
        <input className="input input-40" required minLength={12} type="password" autoComplete="new-password" value={state.password} onChange={(event) => update('password', event.target.value)} />
      </label>
      <label className="auth-field">
        <span className="field-label">Confirm password</span>
        <input className="input input-40" required minLength={12} type="password" autoComplete="new-password" value={state.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} />
      </label>
    </section> : null}

    {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : null}
    <div className="auth-actions">
      {step === 0 ? <button className="btn btn-primary btn-40 btn-block" type="button" disabled={busy} onClick={() => void checkPaperless()}>
        {busy ? 'Checking…' : 'Check Paperless'}
      </button> : null}
      {step === 1 ? <button
        className="btn btn-primary btn-40 btn-block"
        type="button"
        disabled={busy}
        onClick={() => modelVerified ? (setStep(2), setStatus(null)) : void checkProvider()}
      >
        {busy ? 'Checking…' : modelVerified ? 'Continue' : 'Check runtime'}
      </button> : null}
      {step === 2 ? <button className="btn btn-primary btn-40 btn-block" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create owner account'}
      </button> : null}
      {step > 0 ? <button className="btn btn-ghost btn-40 btn-block" type="button" disabled={busy} onClick={() => {
        if (step === 1 && codexLoginId) void cancelCodexLogin();
        setStep((current) => Math.max(0, current - 1));
        setStatus(null);
      }}>Back</button> : null}
    </div>
    {!status ? <p className="field-help auth-footnote">
      Secret fields are never saved in the browser. Non-secret progress is kept only in this tab.
    </p> : null}
  </form>;
}
