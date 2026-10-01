'use client';

import { FormEvent, KeyboardEvent, RefObject, useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isWorking,
  canSend,
  inputRef
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  isWorking: boolean;
  /** False while no model is ready, so a message could not be answered. */
  canSend: boolean;
  /** Lets the page focus the message box from a keyboard shortcut. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
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
      placeholder="Ask about your documents"
      aria-label="Message"
      rows={1}
    />
    {isWorking ? <button className="chat-send" type="button" onClick={onStop} aria-label="Stop response">
      <Square aria-hidden="true" />
    </button> : <button className="chat-send" type="submit" disabled={!value.trim() || !canSend} aria-label="Send message">
      <ArrowUp aria-hidden="true" />
    </button>}
  </form>;
}
