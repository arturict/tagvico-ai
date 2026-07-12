import crypto from 'node:crypto';

export function periodId(secret: string, period: string): string {
  return crypto.createHmac('sha256', secret).update(period).digest('hex');
}

export function providerCategory(provider: string): 'local' | 'hosted' | 'custom' {
  if (provider === 'ollama') return 'local';
  if (provider === 'compatible' || provider === 'custom') return 'custom';
  return 'hosted';
}
