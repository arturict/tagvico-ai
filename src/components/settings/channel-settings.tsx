'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DraftField } from './draft-field';
import { InlineStatus } from './inline-status';
import { SettingSwitch } from './setting-switch';
import { SettingsRow, SettingsSection } from './settings-section';
import type { ChannelId, ChannelSettingsView, ChannelState } from './types';

const copy: Record<ChannelId, {
  title: string;
  summary: string;
  idLabel: string;
  idPlaceholder: string;
  tokenHelp: string;
}> = {
  telegram: {
    title: 'Telegram',
    summary: 'Ask questions, upload documents and approve proposals from a private chat with your bot.',
    idLabel: 'Telegram user ID',
    idPlaceholder: '123456789',
    tokenHelp: 'Create a bot with @BotFather and paste its token.'
  },
  discord: {
    title: 'Discord',
    summary: 'The same assistant in direct messages, and in one home channel if you set one.',
    idLabel: 'Discord user ID',
    idPlaceholder: '123456789012345678',
    tokenHelp: 'Create a bot in the Discord developer portal and paste its token.'
  }
};

const stateKind: Record<ChannelState, 'success' | 'error' | 'loading' | 'neutral'> = {
  connected: 'success',
  error: 'error',
  configured: 'loading',
  'needs-setup': 'neutral',
  off: 'neutral'
};

const credentialNote = {
  profile: '',
  installation: ' (uses the installation token)',
  missing: ' (needs a Paperless token)'
} as const;

type Notify = (kind: 'success' | 'error', message: string) => void;

function ChannelCard({ initial, onMessage }: { initial: ChannelSettingsView; onMessage: Notify }) {
  const { channel } = initial;
  const text = copy[channel];
  const [settings, setSettings] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newId, setNewId] = useState('');
  const [newMember, setNewMember] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const pollTimer = useRef<number | null>(null);
  const locked = new Set(settings.lockedByEnvironment);

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
  }, []);

  // After a save the bot service reconnects within a few seconds; keep asking
  // until it has confirmed (or failed) so the status shown is the real one.
  const followStatus = (attempt = 0) => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    if (attempt >= 12) return;
    pollTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/settings/channels', { cache: 'no-store' });
        const body = await response.json();
        const status = body?.[channel];
        if (status) {
          setSettings((current) => ({ ...current, status }));
          if (status.state === 'configured') followStatus(attempt + 1);
        }
      } catch {
        followStatus(attempt + 1);
      }
    }, 2500);
  };

  const save = async (update: Record<string, unknown>, success: string): Promise<ChannelSettingsView | null> => {
    try {
      const response = await fetch(`/api/settings/channels/${channel}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.field) setErrors((current) => ({ ...current, [body.field]: body.error }));
        else onMessage('error', body.error || 'Could not save.');
        return null;
      }
      setErrors({});
      setSettings(body);
      onMessage('success', success);
      followStatus();
      return body;
    } catch (error) {
      onMessage('error', error instanceof Error ? error.message : 'Could not save.');
      return null;
    }
  };

  const testToken = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/settings/channels/${channel}/test`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      setTestResult(response.ok
        ? { kind: 'success', message: body.label || 'The token is accepted.' }
        : { kind: 'error', message: body.error || 'The test failed.' });
    } catch (error) {
      setTestResult({ kind: 'error', message: error instanceof Error ? error.message : 'The test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const allowed = settings.allowed.map(({ externalId, memberId }) => ({ externalId, memberId }));
  const addPerson = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await save({ allowed: [...allowed, { externalId: newId.trim(), memberId: newMember }] }, 'Person allowed.');
    if (saved) {
      setNewId('');
      setNewMember('');
    }
  };

  return <SettingsSection title={text.title} description={text.summary}>
    <SettingsRow title="Status">
      <div className="channel-status" data-channel={channel} data-state={settings.status.state}>
        <InlineStatus kind={stateKind[settings.status.state]}>{settings.status.label}</InlineStatus>
        {settings.status.detail ? <span className="set-field-help">{settings.status.detail}</span> : null}
      </div>
    </SettingsRow>
    <SettingsRow title="Enabled">
      <SettingSwitch
        checked={settings.enabled}
        disabled={locked.has('enabled')}
        label={`${text.title} enabled`}
        onCheckedChange={(enabled) => void save({ enabled }, enabled ? `${text.title} turned on.` : `${text.title} turned off.`)}
      />
    </SettingsRow>
    <DraftField
      label={`${text.title} bot token`}
      type="password"
      value=""
      configured={settings.tokenConfigured}
      placeholder="Paste the bot token"
      description={text.tokenHelp}
      disabled={locked.has('botToken')}
      error={errors.botToken}
      onCommit={async (botToken) => save({ botToken }, 'Bot token saved.')}
    />
    <SettingsRow title="Token check">
      <div className="set-actions">
        {testResult ? <InlineStatus kind={testResult.kind}>{testResult.message}</InlineStatus> : null}
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!settings.tokenConfigured || testing}
          onClick={() => void testToken()}
        >
          {testing ? 'Testing…' : 'Test token'}
        </button>
        {settings.tokenConfigured && !locked.has('botToken') ? <button
          className="btn btn-danger"
          type="button"
          onClick={() => void save({ clearToken: true }, 'Bot token removed.')}
        >
          Remove token
        </button> : null}
      </div>
    </SettingsRow>
    <SettingsRow
      title="Allowed people"
      description="The bot only answers these people, each with their own Paperless token (set under People & security)."
      stack
    >
      {settings.allowed.length ? <ul className="channel-people" aria-label={`${text.title} allowed people`}>
        {settings.allowed.map((person) => <li key={person.externalId}>
          <code>{person.externalId}</code>
          <span>{person.memberName || 'Not linked to a profile'}</span>
          <button
            className="btn btn-secondary btn-32"
            type="button"
            disabled={locked.has('allowed')}
            onClick={() => void save({ allowed: allowed.filter((entry) => entry.externalId !== person.externalId) }, 'Person removed.')}
          >
            Remove
          </button>
        </li>)}
      </ul> : <InlineStatus kind="neutral">Nobody is allowed yet.</InlineStatus>}
      {!locked.has('allowed') ? <form className="channel-add" onSubmit={(event) => void addPerson(event)}>
        <label className="channel-add-field">
          <span className="field-label">{text.idLabel}</span>
          <input
            className="input"
            value={newId}
            inputMode="numeric"
            placeholder={text.idPlaceholder}
            aria-invalid={errors['allowed.' + settings.allowed.length + '.externalId'] ? true : undefined}
            onChange={(event) => setNewId(event.target.value)}
          />
        </label>
        <label className="channel-add-field">
          <span className="field-label">Household profile</span>
          <select className="select" value={newMember} onChange={(event) => setNewMember(event.target.value)}>
            <option value="">Choose a person</option>
            {settings.members.map((member) => <option key={member.id} value={member.id} disabled={member.credential === 'missing'}>
              {member.name}{credentialNote[member.credential]}
            </option>)}
          </select>
        </label>
        <button className="btn btn-secondary" disabled={!newId.trim() || !newMember}>Allow</button>
      </form> : null}
      {Object.entries(errors).filter(([field]) => field.startsWith('allowed')).map(([field, message]) => <span
        className="set-field-error"
        role="alert"
        key={field}
      >{message}</span>)}
    </SettingsRow>
    {channel === 'discord' ? <DraftField
      label="Home channel ID"
      value={settings.homeChannelId}
      placeholder="123456789012345678"
      description="Optional. The bot answers mentions in this channel and ignores the rest of the server."
      disabled={locked.has('homeChannelId')}
      error={errors.homeChannelId}
      onCommit={(homeChannelId) => save({ homeChannelId }, 'Home channel saved.')}
    /> : null}
    <SettingsRow title="Deadline reminders" description="One message a day for actions that are due soon or overdue.">
      <SettingSwitch
        checked={settings.remindersEnabled}
        disabled={locked.has('remindersEnabled')}
        label={`${text.title} reminders`}
        onCheckedChange={(remindersEnabled) => void save({ remindersEnabled }, remindersEnabled ? 'Reminders turned on.' : 'Reminders turned off.')}
      />
    </SettingsRow>
    {locked.size ? <div className="set-row">
      <InlineStatus kind="neutral">
        Set by the container environment and not editable here: {[...locked].join(', ')}.
      </InlineStatus>
    </div> : null}
  </SettingsSection>;
}

export function ChannelSettings({
  channels,
  onMessage
}: {
  channels: Record<ChannelId, ChannelSettingsView>;
  onMessage: Notify;
}) {
  return <>
    <p className="set-note">Bot tokens are write-only: Tagvico never shows a saved token again.</p>
    <ChannelCard initial={channels.telegram} onMessage={onMessage} />
    <ChannelCard initial={channels.discord} onMessage={onMessage} />
  </>;
}
