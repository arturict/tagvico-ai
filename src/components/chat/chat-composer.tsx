'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef } from 'react';
import { ArrowUp, FolderOpen, Square } from 'lucide-react';
import { CompanionModelPicker } from '@/components/companion-model-picker';

export function ChatComposer({
  sessionId,
  value,
  onChange,
  onSubmit,
  onStop,
  isWorking
}: {
  sessionId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  isWorking: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = '0';
    field.style.height = value ? `${Math.min(field.scrollHeight, 200)}px` : '';
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return <form className="chat-composer" onSubmit={onSubmit}>
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Ask about your documents, or tell Tagvico what to do…"
      aria-label="Message"
      rows={1}
    />
    <div className="chat-composer-bar">
      <span className="chat-chip" title="Tagvico searches every document in your archive">
        <FolderOpen aria-hidden="true" />All documents
      </span>
      <CompanionModelPicker sessionId={sessionId} />
      <span className="chat-composer-hint">Enter to send · Shift+Enter for a new line</span>
      {isWorking ? <button className="chat-send is-stop" type="button" onClick={onStop} aria-label="Stop response">
        <Square aria-hidden="true" />
      </button> : <button className="chat-send" type="submit" disabled={!value.trim()} aria-label="Send message">
        <ArrowUp aria-hidden="true" />
      </button>}
    </div>
  </form>;
}
