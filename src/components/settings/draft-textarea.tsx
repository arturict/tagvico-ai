'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function DraftTextarea({
  label,
  description,
  value,
  rows = 5,
  placeholder,
  configured = false,
  sensitive = false,
  error,
  onCommit
}: {
  label: string;
  description?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  configured?: boolean;
  sensitive?: boolean;
  /** Validation message from the last failed save of this field. */
  error?: string;
  /** Resolve to `null` to signal a failed save; anything else counts as saved. */
  onCommit: (value: string) => Promise<unknown> | void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(sensitive ? '' : value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    setDraft(sensitive ? '' : value);
  }, [sensitive, value]);

  useEffect(() => () => {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
  }, []);

  const commit = async () => {
    if (saving || (!sensitive && draft === value) || (sensitive && !draft.trim())) return;
    setSaving(true);
    try {
      const result = await onCommit(draft);
      if (sensitive && result !== null) setDraft('');
      if (result !== null) {
        setSaved(true);
        if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 2500);
      } else {
        setSaved(false);
      }
    }
    finally { setSaving(false); }
  };

  return <label className="settings-field" htmlFor={id}>
    <span className="settings-field-label">
      {label}
      {saving
        ? <small>Saving…</small>
        : saved
          ? <small className="settings-field-saved">Saved</small>
          : configured && sensitive ? <small>Configured</small> : null}
    </span>
    <textarea
      id={id}
      className="settings-input settings-textarea"
      rows={rows}
      value={draft}
      placeholder={configured && sensitive ? 'Configured — type only to replace' : placeholder}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(sensitive ? '' : value);
          event.currentTarget.blur();
        }
      }}
    />
    {error ? <span className="settings-field-error" id={`${id}-error`} role="alert">{error}</span> : null}
    {description ? <span className="settings-field-help">{description}</span> : null}
  </label>;
}
