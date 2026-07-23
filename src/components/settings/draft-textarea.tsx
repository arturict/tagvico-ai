'use client';

import { useEffect, useId, useState } from 'react';

export function DraftTextarea({
  label,
  description,
  value,
  rows = 5,
  placeholder,
  configured = false,
  sensitive = false,
  onCommit
}: {
  label: string;
  description?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  configured?: boolean;
  sensitive?: boolean;
  onCommit: (value: string) => Promise<unknown> | void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(sensitive ? '' : value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(sensitive ? '' : value);
  }, [sensitive, value]);

  const commit = async () => {
    if (saving || (!sensitive && draft === value) || (sensitive && !draft.trim())) return;
    setSaving(true);
    try {
      const result = await onCommit(draft);
      if (sensitive && result !== null) setDraft('');
    }
    finally { setSaving(false); }
  };

  return <label className="settings-field" htmlFor={id}>
    <span className="settings-field-label">
      {label}
      {saving ? <small>Saving…</small> : configured && sensitive ? <small>Configured</small> : null}
    </span>
    <textarea
      id={id}
      className="settings-input settings-textarea"
      rows={rows}
      value={draft}
      placeholder={configured && sensitive ? 'Configured — type only to replace' : placeholder}
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
    {description ? <span className="settings-field-help">{description}</span> : null}
  </label>;
}
