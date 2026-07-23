'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';

export function DraftField({
  label,
  description,
  value,
  type = 'text',
  placeholder,
  configured = false,
  disabled = false,
  onCommit
}: {
  label: string;
  description?: string;
  value: string;
  type?: 'text' | 'password' | 'url' | 'number';
  placeholder?: string;
  configured?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => Promise<unknown> | void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(type === 'password' ? '' : value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (type !== 'password') setDraft(value);
  }, [type, value]);

  const commit = async () => {
    if (disabled || saving) return;
    if (type !== 'password' && draft === value) return;
    if (type === 'password' && !draft.trim()) return;
    setSaving(true);
    try {
      const result = await onCommit(draft);
      if (type === 'password' && result !== null) setDraft('');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      setDraft(type === 'password' ? '' : value);
      event.currentTarget.blur();
    }
  };

  return <label className="settings-field" htmlFor={id}>
    <span className="settings-field-label">
      {label}
      {saving ? <small>Saving…</small> : configured && type === 'password' ? <small>Configured</small> : null}
    </span>
    <input
      id={id}
      className="settings-input"
      type={type}
      value={draft}
      placeholder={configured && type === 'password' ? 'Configured — type only to replace' : placeholder}
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
    />
    {description ? <span className="settings-field-help">{description}</span> : null}
  </label>;
}
