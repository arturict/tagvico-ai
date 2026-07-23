'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileStack, KeyRound, Sparkles } from 'lucide-react';
import { InlineStatus } from './inline-status';
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

export function SetupWizard({ providers }: { providers: ProviderDescriptor[] }) {
  const router = useRouter();
  const [state, setState] = useState<SetupState>({
    paperlessUrl: '',
    paperlessToken: '',
    paperlessUsername: 'admin',
    providerId: providers.find((provider) => provider.recommended)?.instanceId || providers[0]?.instanceId || 'openrouter',
    modelId: '',
    providerValues: {},
    username: 'admin',
    password: '',
    confirmPassword: ''
  });
  const [status, setStatus] = useState<{ kind: 'loading' | 'error' | 'success'; message: string } | null>(null);
  const provider = providers.find((candidate) => candidate.instanceId === state.providerId);

  const update = (key: keyof SetupState, value: string | Record<string, string>) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.password !== state.confirmPassword) {
      setStatus({ kind: 'error', message: 'Passwords do not match.' });
      return;
    }
    setStatus({ kind: 'loading', message: 'Validating Paperless, provider and account…' });
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
      setStatus({ kind: 'success', message: 'Setup complete. Opening sign in…' });
      router.push('/login?setup=success');
      router.refresh();
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Setup could not be completed.' });
    }
  };

  return <form className="setup-wizard" onSubmit={submit}>
    <div className="setup-progress" aria-label="Setup steps">
      <span><FileStack aria-hidden="true" /> Paperless</span>
      <span><Sparkles aria-hidden="true" /> AI runtime</span>
      <span><KeyRound aria-hidden="true" /> Owner account</span>
      <span><Check aria-hidden="true" /> Validate</span>
    </div>

    <SettingsSection title="1. Connect Paperless-ngx" description="Tagvico verifies the URL, token and required Paperless permissions before saving.">
      <SettingsRow title="Paperless connection" description="Use the base URL without /api. The token is never echoed back." stack>
        <div className="settings-fields-grid">
          <label className="settings-field">
            <span className="settings-field-label">Base URL</span>
            <input className="settings-input" type="url" required value={state.paperlessUrl} onChange={(event) => update('paperlessUrl', event.target.value)} placeholder="http://paperless:8000" />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">Paperless username</span>
            <input className="settings-input" value={state.paperlessUsername} onChange={(event) => update('paperlessUsername', event.target.value)} />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">API token</span>
            <input className="settings-input" type="password" autoComplete="new-password" required value={state.paperlessToken} onChange={(event) => update('paperlessToken', event.target.value)} />
          </label>
        </div>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="2. Choose an AI runtime" description="Provider fields use the same registry and schema metadata as the authenticated settings page.">
      <SettingsRow title="Provider" description={provider?.description}>
        <select
          className="settings-select"
          value={state.providerId}
          onChange={(event) => setState((current) => ({
            ...current,
            providerId: event.target.value,
            modelId: '',
            providerValues: {}
          }))}
        >
          {providers.filter((candidate) => candidate.available).map((candidate) => <option key={candidate.instanceId} value={candidate.instanceId}>
            {candidate.name}{candidate.recommended ? ' — recommended' : ''}
          </option>)}
        </select>
      </SettingsRow>
      {provider?.fields.length ? <SettingsRow title="Connection" description="Secrets remain in the submitted request and are stored only in Tagvico data." stack>
        <div className="settings-fields-grid">
          {provider.fields.map((field) => <label className="settings-field" key={field.key}>
            <span className="settings-field-label">{field.label}</span>
            <input
              className="settings-input"
              type={field.type}
              required={field.required}
              autoComplete={field.secret ? 'new-password' : 'off'}
              placeholder={field.placeholder}
              value={state.providerValues[field.key] || ''}
              onChange={(event) => update('providerValues', {
                ...state.providerValues,
                [field.key]: event.target.value
              })}
            />
            {field.description ? <span className="settings-field-help">{field.description}</span> : null}
          </label>)}
        </div>
      </SettingsRow> : null}
      <SettingsRow
        title="Model ID"
        description={provider?.manualModelInput
          ? 'Enter the provider model ID. You can switch to the live model picker after signing in.'
          : 'The runtime will load the account model catalog after setup.'}
      >
        <input
          className="settings-input"
          value={state.modelId}
          required={Boolean(provider?.manualModelInput)}
          disabled={!provider?.manualModelInput}
          onChange={(event) => update('modelId', event.target.value)}
          placeholder={provider?.manualModelInput ? 'provider/model-id' : 'Loaded after authentication'}
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="3. Create the owner account" description="This local account controls installation settings and household administration.">
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
    </SettingsSection>

    <div className="setup-submit">
      {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : <p>Nothing is written until validation succeeds.</p>}
      <button className="settings-button is-primary" type="submit" disabled={status?.kind === 'loading'}>Complete setup</button>
    </div>
  </form>;
}
