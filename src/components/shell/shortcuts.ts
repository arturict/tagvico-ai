/**
 * Keyboard shortcuts of the app. The decision is a pure function so it can be tested without a
 * browser; the components only attach it to `keydown` and act on the answer.
 *
 *   /  or  Ctrl/Cmd+K          focus the message box (chat page)
 *   Ctrl/Cmd+Shift+O           start a new chat (every page, same key as ChatGPT)
 *   Escape                     stop the answer that is being written (chat page)
 *
 * Ctrl/Cmd+1 to 9 pick a favourite model and are handled by the model picker.
 */

export type ShortcutAction = 'focus-composer' | 'new-chat' | 'stop-response';

export type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
};

export type ShortcutTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
} | null;

/** Menus, dialogs and popovers own Escape and plain keys while they are open. */
export const OVERLAY_SELECTOR = '[role="menu"], [role="listbox"], [role="dialog"]:not([hidden]), [role="alertdialog"]';

export function isTypingTarget(target: ShortcutTarget) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

export function shortcutAction(
  event: ShortcutEvent,
  target: ShortcutTarget,
  context: { streaming?: boolean; overlayOpen?: boolean } = {}
): ShortcutAction | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) return null;
  const command = Boolean(event.ctrlKey || event.metaKey);
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (command && !event.altKey) {
    if (event.shiftKey && key === 'o') return 'new-chat';
    if (!event.shiftKey && key === 'k') return context.overlayOpen ? null : 'focus-composer';
    return null;
  }
  if (command || event.altKey) return null;

  if (key === 'Escape') {
    return context.streaming && !context.overlayOpen && !target?.closest?.(OVERLAY_SELECTOR) ? 'stop-response' : null;
  }
  // "/" needs Shift on some layouts (German), so Shift is allowed here.
  if (key === '/' && !isTypingTarget(target) && !context.overlayOpen) return 'focus-composer';
  return null;
}

/** Rows of the "Keyboard shortcuts" dialog; `keys` use "Mod" for Ctrl or Cmd. */
export const SHORTCUT_LIST: Array<{ keys: string[]; label: string }> = [
  { keys: ['/'], label: 'Focus the message box' },
  { keys: ['Mod', 'K'], label: 'Focus the message box' },
  { keys: ['Mod', 'Shift', 'O'], label: 'New chat' },
  { keys: ['Esc'], label: 'Stop the answer' },
  { keys: ['Enter'], label: 'Send the message' },
  { keys: ['Shift', 'Enter'], label: 'New line' },
  { keys: ['Mod', '1 to 9'], label: 'Choose a favourite model' }
];
