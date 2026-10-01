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
  layout = 'row',
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
  /** `row` puts the label left and the input right; `stack` puts the input under the label. */
  layout?: 'row' | 'stack';
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

  return <label className={`set-field${layout === 'stack' ? ' is-stacked' : ''}`} htmlFor={id}>
    <span className="set-field-copy">
      <span className="set-field-label">
        {label}
        {saving
          ? <small>Saving…</small>
          : saved
            ? <small className="set-field-saved">Saved</small>
            : configured && type === 'password' ? <small>Configured</small> : null}
      </span>
      {description ? <span className="set-field-help">{description}</span> : null}
    </span>
    <span className="set-field-control">
      <input
        id={id}
        className="input"
        type={type}
        value={draft}
        placeholder={configured && type === 'password' ? 'Configured, type only to replace' : placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
      />
      {error ? <span className="set-field-error" id={`${id}-error`} role="alert">{error}</span> : null}
    </span>
  </label>;
}
