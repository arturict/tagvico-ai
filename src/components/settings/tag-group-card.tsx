'use client';

import { useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { SettingSwitch } from './setting-switch';
import type { TagGroup } from './types';

export function TagGroupCard({
  group,
  duplicateTags = [],
  onChange,
  onDelete
}: {
  group: TagGroup;
  duplicateTags?: string[];
  onChange: (group: TagGroup) => Promise<void>;
  onDelete?: (group: TagGroup) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState(group.name);
  const [saving, setSaving] = useState(false);

  const commit = async (next: TagGroup) => {
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  };

  const addTag = async () => {
    const value = draft.trim().replace(/\s+/g, ' ');
    if (!value || group.tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    setDraft('');
    await commit({ ...group, tags: [...group.tags, value] });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      void addTag();
    }
  };

  return <article className={`settings-tag-card${group.enabled ? ' is-enabled' : ''}`}>
    <header>
      <div>
        {group.preset || group.permanent
          ? <strong>{group.name}</strong>
          : <input
              className="settings-tag-name"
              value={nameDraft}
              disabled={saving}
              aria-label="Group name"
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                const name = nameDraft.trim().replace(/\s+/g, ' ');
                if (!name) {
                  setNameDraft(group.name);
                  return;
                }
                if (name !== group.name) void commit({ ...group, name });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setNameDraft(group.name);
                  event.currentTarget.blur();
                }
              }}
            />}
        <small>{group.tags.length} tags{group.permanent ? ' · permanent group' : ''}</small>
      </div>
      <div className="settings-tag-card-actions">
        {!group.preset && !group.permanent && onDelete
          ? <button
              className="settings-icon-button is-danger"
              type="button"
              disabled={saving}
              aria-label={`Delete ${group.name}`}
              onClick={() => void onDelete(group)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          : null}
        <SettingSwitch
          checked={group.enabled}
          disabled={saving}
          label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`}
          onCheckedChange={(enabled) => void commit({ ...group, enabled })}
        />
      </div>
    </header>
    {duplicateTags.length
      ? <p className="settings-tag-warning">Also used in another group: {duplicateTags.join(', ')}</p>
      : null}
    <div className="settings-tag-chips">
      {group.tags.map((tag) => <span key={tag}>
        {tag}
        <button
          type="button"
          disabled={saving}
          onClick={() => void commit({ ...group, tags: group.tags.filter((candidate) => candidate !== tag) })}
          aria-label={`Remove ${tag} from ${group.name}`}
        >
          <X aria-hidden="true" />
        </button>
      </span>)}
      {!group.tags.length ? <small>No tags in this group.</small> : null}
    </div>
    <label className="settings-tag-add">
      <span className="sr-only">Add a tag to {group.name}</span>
      <input
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add tag, then press Enter"
      />
      <button type="button" disabled={saving || !draft.trim()} onClick={() => void addTag()} aria-label={`Add tag to ${group.name}`}>
        <Plus aria-hidden="true" />
      </button>
    </label>
  </article>;
}
