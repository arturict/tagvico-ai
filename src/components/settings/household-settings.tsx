'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { InlineStatus } from './inline-status';
import { SettingsRow, SettingsSection } from './settings-section';

export type HouseholdMember = {
  id: string;
  display_name: string;
  role: string;
  paperless_user_id: number | null;
  paperless_configured: boolean;
  /** The profile belongs to a Tagvico web account and cannot be removed here. */
  has_login: boolean;
};

type PaperlessUserOption = { id: number; username: string };
type Notify = (kind: 'success' | 'error', message: string) => void;
type FieldErrors = Record<string, string>;

const roleOptions = [
  { id: 'adult', label: 'Adult' },
  { id: 'member', label: 'Member' },
  { id: 'viewer', label: 'Viewer' }
] as const;

const roleHelp = 'Adults and the owner approve changes. Members and viewers can ask and see.';

async function request<T = Record<string, unknown>>(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error || 'Request failed'), { field: body.field as string | undefined });
  }
  return body as T;
}

function MemberRow({
  member,
  isOwnerView,
  isSelf,
  onChanged,
  onRemoved,
  onMessage
}: {
  member: HouseholdMember;
  isOwnerView: boolean;
  isSelf: boolean;
  onChanged: (member: HouseholdMember) => void;
  onRemoved: (memberId: string) => void;
  onMessage: Notify;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(member.display_name);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = member.role === 'owner';

  const update = async (patch: { displayName?: string; role?: string }, success: string) => {
    setBusy(true);
    setError('');
    try {
      const updated = await request<HouseholdMember>(`/api/household/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      onChanged(updated);
      onMessage('success', success);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save.';
      setError(message);
      onMessage('error', message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await request(`/api/household/members/${member.id}`, { method: 'DELETE' });
      onRemoved(member.id);
      onMessage('success', `${member.display_name} removed.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not remove this profile.';
      setError(message);
      setConfirmingRemoval(false);
      onMessage('error', message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="set-member household-member" data-member-id={member.id}>
    <MemberAvatar name={member.display_name} memberId={member.id} size={32} />
    <span className="household-member-name">
      {renaming ? <form
        className="household-rename"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await update({ displayName: name }, 'Name saved.')) setRenaming(false);
        }}
      >
        <input
          className="input"
          value={name}
          maxLength={100}
          aria-label={`New name for ${member.display_name}`}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Save name</button>
        <button className="btn btn-secondary" type="button" onClick={() => { setRenaming(false); setName(member.display_name); setError(''); }}>
          Cancel
        </button>
      </form> : <>
        <strong>{member.display_name}{isSelf ? <small> you</small> : null}</strong>
        <small>
          Paperless token {member.paperless_configured ? 'configured' : 'missing'}
          {member.paperless_user_id ? ` · user ${member.paperless_user_id}` : ''}
        </small>
      </>}
      {error ? <span className="set-field-error" role="alert">{error}</span> : null}
    </span>
    {isOwnerView && !isOwner ? <select
      className="select household-role"
      value={member.role}
      disabled={busy}
      aria-label={`Role of ${member.display_name}`}
      onChange={(event) => void update({ role: event.target.value }, `${member.display_name} is now ${event.target.value === 'adult' ? 'an adult' : `a ${event.target.value}`}.`)}
    >
      {roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select> : <span className="set-member-role">{member.role}</span>}
    {isOwnerView && !isOwner && !renaming ? <span className="household-actions">
      <button className="btn btn-ghost btn-32" type="button" disabled={busy} onClick={() => setRenaming(true)}>Rename</button>
      {confirmingRemoval ? <>
        <button className="btn btn-danger btn-32" type="button" disabled={busy} onClick={() => void remove()}>
          Remove {member.display_name}
        </button>
        <button className="btn btn-ghost btn-32" type="button" onClick={() => setConfirmingRemoval(false)}>Keep</button>
      </> : member.has_login
        ? <span className="set-field-help">Has a sign-in</span>
        : <button className="btn btn-ghost btn-32" type="button" disabled={busy} onClick={() => setConfirmingRemoval(true)}>Remove</button>}
    </span> : null}
    {isOwnerView && isOwner && !renaming ? <span className="household-actions">
      <button className="btn btn-ghost btn-32" type="button" disabled={busy} onClick={() => setRenaming(true)}>Rename</button>
    </span> : null}
  </div>;
}

function PaperlessAccessRow({
  member,
  paperlessUsers,
  onChanged,
  onMessage
}: {
  member: HouseholdMember;
  paperlessUsers: PaperlessUserOption[] | null;
  onChanged: (member: HouseholdMember) => void;
  onMessage: Notify;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = String(data.get('paperlessUserId') || '');
    // Omit an unchanged link so a new token can link its own Paperless user automatically.
    const linkChanged = userId !== String(member.paperless_user_id ?? '');
    setBusy(true);
    setErrors({});
    try {
      const result = await request<{ member: HouseholdMember }>(`/api/household/members/${member.id}/paperless`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: data.get('token'),
          removeToken: data.get('removeToken') === 'on',
          ...(linkChanged ? { paperlessUserId: userId ? Number(userId) : null } : {})
        })
      });
      form.reset();
      if (result.member) onChanged(result.member);
      onMessage('success', `Paperless access saved for ${member.display_name}.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save Paperless access.';
      const field = (caught as { field?: string }).field;
      setErrors({ [field || 'form']: message });
      onMessage('error', message);
    } finally {
      setBusy(false);
    }
  };

  return <SettingsRow title={member.display_name} stack>
    <form className="set-access-form" onSubmit={(event) => void save(event)} data-member-id={member.id}>
      <input
        className="input"
        name="token"
        type="password"
        autoComplete="new-password"
        placeholder={member.paperless_configured ? 'Configured, type to replace' : 'Paperless API token'}
        aria-label={`${member.display_name} Paperless API token`}
        aria-invalid={errors.token ? true : undefined}
      />
      {paperlessUsers && paperlessUsers.length ? <select
        className="select"
        name="paperlessUserId"
        defaultValue={member.paperless_user_id ? String(member.paperless_user_id) : ''}
        key={`${member.id}-${member.paperless_user_id ?? 'none'}`}
        aria-label={`${member.display_name} Paperless user`}
      >
        <option value="">No Paperless user</option>
        {paperlessUsers.map((user) => <option key={user.id} value={user.id}>{user.username} (#{user.id})</option>)}
      </select> : <input
        className="input"
        name="paperlessUserId"
        type="number"
        min="1"
        defaultValue={member.paperless_user_id || ''}
        key={`${member.id}-${member.paperless_user_id ?? 'none'}`}
        placeholder="Paperless user ID"
        aria-label={`${member.display_name} Paperless user ID`}
        aria-invalid={errors.paperlessUserId ? true : undefined}
      />}
      <label className="set-check"><input name="removeToken" type="checkbox" /> Remove token</label>
      <button className="btn btn-secondary" disabled={busy}>Save access</button>
    </form>
    {Object.entries(errors).map(([field, message]) => <span className="set-field-error" role="alert" key={field}>{message}</span>)}
  </SettingsRow>;
}

export function HouseholdSettings({
  currentMemberId,
  currentRole,
  members: initialMembers,
  onMessage
}: {
  currentMemberId: string;
  currentRole: string;
  members: HouseholdMember[];
  onMessage: Notify;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [paperlessUsers, setPaperlessUsers] = useState<PaperlessUserOption[] | null>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('adult');
  const [addError, setAddError] = useState('');
  const [working, setWorking] = useState(false);
  const isOwnerView = currentRole === 'owner';

  useEffect(() => {
    if (!isOwnerView) return;
    let cancelled = false;
    void fetch('/api/paperless/users', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body.available) setPaperlessUsers(body.users); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isOwnerView]);

  const replace = (updated: HouseholdMember) => setMembers((current) => current.map((member) => member.id === updated.id ? updated : member));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setAddError('');
    try {
      const created = await request<HouseholdMember>('/api/household/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName, role: newRole })
      });
      setMembers((current) => [...current, created]);
      setNewName('');
      onMessage('success', `${created.display_name} added.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not add this profile.';
      setAddError(message);
    } finally {
      setWorking(false);
    }
  };

  const managedMembers = isOwnerView ? members : members.filter((member) => member.id === currentMemberId);

  return <>
    <SettingsSection title="Household profiles" description={roleHelp}>
      <div className="set-member-list">
        {members.map((member) => <MemberRow
          key={member.id}
          member={member}
          isOwnerView={isOwnerView}
          isSelf={member.id === currentMemberId}
          onChanged={replace}
          onRemoved={(memberId) => setMembers((current) => current.filter((entry) => entry.id !== memberId))}
          onMessage={onMessage}
        />)}
      </div>
      {isOwnerView ? <>
        <form className="set-inline-form" onSubmit={(event) => void add(event)}>
          <input
            className="input"
            name="displayName"
            value={newName}
            maxLength={100}
            required
            placeholder="Profile name"
            aria-label="Profile name"
            aria-invalid={addError ? true : undefined}
            onChange={(event) => setNewName(event.target.value)}
          />
          <select className="select" name="role" value={newRole} aria-label="Profile role" onChange={(event) => setNewRole(event.target.value)}>
            {roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={working || !newName.trim()}>Add profile</button>
        </form>
        {addError ? <span className="set-field-error household-add-error" role="alert">{addError}</span> : null}
      </> : <InlineStatus kind="neutral">Only the household owner can add, rename or remove profiles.</InlineStatus>}
    </SettingsSection>

    <SettingsSection
      title="Paperless access"
      description="Tokens are write-only and checked with Paperless before they are saved."
    >
      {managedMembers.map((member) => <PaperlessAccessRow
        key={member.id}
        member={member}
        paperlessUsers={paperlessUsers}
        onChanged={replace}
        onMessage={onMessage}
      />)}
    </SettingsSection>
  </>;
}
