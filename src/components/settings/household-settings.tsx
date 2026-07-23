'use client';

import { useState, type FormEvent } from 'react';
import { SettingsRow, SettingsSection } from './settings-section';

export type HouseholdMember = {
  id: string;
  display_name: string;
  role: string;
  paperless_user_id?: number;
  paperless_configured?: boolean | number;
};

export function HouseholdSettings({
  currentMemberId,
  currentRole,
  householdKind,
  members,
  onMessage
}: {
  currentMemberId: string;
  currentRole: string;
  householdKind: string;
  members: HouseholdMember[];
  onMessage: (kind: 'success' | 'error', message: string) => void;
}) {
  const [working, setWorking] = useState(false);

  const request = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  };

  const saveAccess = async (event: FormEvent<HTMLFormElement>, memberId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setWorking(true);
    try {
      await request(`/api/household/members/${memberId}/paperless`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: data.get('token'),
          removeToken: data.get('removeToken') === 'on',
          paperlessUserId: data.get('paperlessUserId') ? Number(data.get('paperlessUserId')) : undefined
        })
      });
      form.reset();
      onMessage('success', 'Paperless access saved.');
    } catch (error) {
      onMessage('error', error instanceof Error ? error.message : 'Could not save Paperless access.');
    } finally {
      setWorking(false);
    }
  };

  const managedMembers = currentRole === 'owner'
    ? members
    : members.filter((member) => member.id === currentMemberId);

  return <>
    <SettingsSection
      title="Household profiles"
      description={householdKind === 'solo'
        ? 'This is a solo workspace. Managed profiles turn it into a household without creating extra web logins.'
        : 'Profiles control assignments and Paperless permissions inside this household.'}
    >
      <div className="settings-member-list">
        {members.map((member) => <div className="settings-member" key={member.id}>
          <span className="settings-member-avatar">{member.display_name.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{member.display_name}</strong>
            <small>Paperless {member.paperless_configured ? 'configured' : 'not configured'}</small>
          </span>
          <span className="settings-badge">{member.role}</span>
        </div>)}
      </div>
      {currentRole === 'owner' ? <form className="settings-inline-form" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setWorking(true);
        try {
          await request('/api/household/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(data))
          });
          onMessage('success', 'Managed profile added. Reload to see it in the list.');
          event.currentTarget.reset();
        } catch (error) {
          onMessage('error', error instanceof Error ? error.message : 'Could not add profile.');
        } finally {
          setWorking(false);
        }
      }}>
        <input className="settings-input" name="displayName" maxLength={100} required placeholder="Profile name" aria-label="Profile name" />
        <select className="settings-select" name="role" aria-label="Profile role">
          <option value="adult">Adult</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button className="settings-button" disabled={working}>Add profile</button>
      </form> : null}
    </SettingsSection>

    <SettingsSection title="Profile Paperless access" description="Tokens stay encrypted and are never returned to this page.">
      {managedMembers.map((member) => <SettingsRow
        key={member.id}
        title={member.display_name}
        description={`Role: ${member.role} · token ${member.paperless_configured ? 'configured' : 'missing'}`}
        stack
      >
        <form className="settings-access-form" onSubmit={(event) => void saveAccess(event, member.id)}>
          <input
            className="settings-input"
            name="token"
            type="password"
            autoComplete="new-password"
            placeholder={member.paperless_configured ? 'Configured — type only to replace' : 'Paperless API token'}
            aria-label={`${member.display_name} Paperless API token`}
          />
          <input
            className="settings-input"
            name="paperlessUserId"
            type="number"
            min="1"
            defaultValue={member.paperless_user_id || ''}
            placeholder="Paperless user ID"
            aria-label={`${member.display_name} Paperless user ID`}
          />
          <label className="settings-checkbox"><input name="removeToken" type="checkbox" /> Remove token</label>
          <button className="settings-button" disabled={working}>Save access</button>
        </form>
      </SettingsRow>)}
    </SettingsSection>
  </>;
}
