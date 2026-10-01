import { RotateCcw, X } from 'lucide-react';
import { Mascot } from '@/components/mascot/mascot';
import type { CompanionErrorView } from '@root/contracts/companion';

const SETTINGS_ACTIONS: Partial<Record<CompanionErrorView['code'], string>> = {
  'no-provider': 'Open AI models',
  chatgpt: 'Sign in again',
  'provider-auth': 'Open AI models',
  'provider-unreachable': 'Open AI models'
};

/**
 * Failure above the composer. Provider problems point to the AI models
 * settings (owners only); everything else offers a retry of the same question.
 */
export function ChatErrorNotice({
  error,
  canManageSettings,
  onRetry,
  onDismiss
}: {
  error: CompanionErrorView;
  canManageSettings: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const settingsLabel = SETTINGS_ACTIONS[error.code];
  const calm = Boolean(settingsLabel) || error.code === 'provider-limit';
  return <div className={`chat-notice alert ${calm ? 'is-warning' : 'is-danger'}`} role="alert" data-error-code={error.code}>
    <Mascot pose="oops" size={32} />
    <span>{error.message}</span>
    {settingsLabel ? (canManageSettings
      ? <a className="chat-notice-action" href="/settings/providers">{settingsLabel}</a>
      : <small>Ask an owner to check the AI models settings.</small>) : null}
    {onRetry ? <button type="button" className="chat-notice-action" onClick={onRetry}>
      <RotateCcw aria-hidden="true" />Try again
    </button> : null}
    <button type="button" className="chat-notice-dismiss" onClick={onDismiss} aria-label="Dismiss message"><X aria-hidden="true" /></button>
  </div>;
}
