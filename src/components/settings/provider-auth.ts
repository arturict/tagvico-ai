export type ProviderAuth = { loading: boolean; authenticated: boolean; label: string };

export const idleAuth: ProviderAuth = { loading: false, authenticated: false, label: '' };

type StatusBody = {
  planUsage?: unknown;
  authenticated?: unknown;
  account?: { email?: unknown; planType?: unknown } | null;
};

/** Turns a provider's /status response into what the sign-in card shows. */
export function providerAuthFromStatus(providerId: string, body: StatusBody): ProviderAuth {
  const authenticated = providerId === 'chatgpt' ? body.planUsage === true : body.authenticated === true;
  if (providerId === 'chatgpt') {
    return { loading: false, authenticated, label: authenticated ? String(body.account?.email || '') : '' };
  }
  const plan = providerId === 'codex' && body.account?.planType ? ` · ${String(body.account.planType)}` : '';
  return { loading: false, authenticated, label: authenticated ? `Connected${plan}` : 'Not connected' };
}
