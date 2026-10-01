'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export function DraftField({
  label,
  description,
  value,
  type = 'text',
  placeholder,
  configured = false,
  disabled = false,
  error,
  onCommit
}: {
  label: string;
  description?: string;
  value: string;
  type?: 'text' | 'password' | 'url' | 'number';
  placeholder?: string;
  configured?: boolean;
  disabled?: boolean;
  /** Validation message from the last failed save of this field. */
  error?: string;
  /** Resolve to `null` to signal a failed save; anything else counts as saved. */
  onCommit: (value: string) => Promise<unknown> | void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(type === 'password' ? '' : value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
  }, []);

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
      if (result !== null) {
        setSaved(true);
        if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 2500);
      } else {
        setSaved(false);
      }
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
      {saving
        ? <small>Saving…</small>
        : saved
          ? <small className="settings-field-saved">Saved</small>
          : configured && type === 'password' ? <small>Configured</small> : null}
    </span>
    <input
      id={id}
      className="settings-input"
      type={type}
      value={draft}
      placeholder={configured && type === 'password' ? 'Configured — type only to replace' : placeholder}
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
    />
    {error ? <span className="settings-field-error" id={`${id}-error`} role="alert">{error}</span> : null}
    {description ? <span className="settings-field-help">{description}</span> : null}
  </label>;
}
