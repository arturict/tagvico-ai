'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ChatModelChip, type ModelChipState } from '@/components/chat/chat-model-chip';

export function ChatComposer({
  sessionId,
  value,
  onChange,
  onSubmit,
  onStop,
  onModelState,
  isWorking,
  canSend
}: {
  sessionId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  onModelState: (state: ModelChipState) => void;
  isWorking: boolean;
  /** False while no model is ready, so a message could not be answered. */
  canSend: boolean;
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
      if (!isWorking && canSend) event.currentTarget.form?.requestSubmit();
    }
  };

  return <form className="chat-composer" onSubmit={onSubmit}>
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Ask about your documents or open actions"
      aria-label="Message"
      rows={1}
    />
    <div className="chat-composer-bar">
      <ChatModelChip sessionId={sessionId} onState={onModelState} />
      <span className="chat-composer-hint">Enter to send · Shift+Enter for a new line</span>
      {isWorking ? <button className="chat-send is-stop" type="button" onClick={onStop} aria-label="Stop response">
        <Square aria-hidden="true" />
      </button> : <button className="chat-send" type="submit" disabled={!value.trim() || !canSend} aria-label="Send message">
        <ArrowUp aria-hidden="true" />
      </button>}
    </div>
  </form>;
}
