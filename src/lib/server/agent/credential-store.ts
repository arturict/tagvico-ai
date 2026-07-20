import 'server-only';

const config = require('../../../../config/config');

export function runtimeConfiguration() {
  const provider = String(process.env.COMPANION_PROVIDER || config.aiProvider || 'opencode').toLowerCase();
  if (provider === 'codex') return { provider: 'codex' as const, model: String(config.codex.model) };
  if (provider === 'openrouter') return { provider: 'openrouter' as const, baseURL: String(config.openrouter.baseUrl), apiKey: String(config.openrouter.apiKey), model: String(config.openrouter.model) };
  if (provider === 'openai') return { provider: 'openai' as const, apiKey: String(config.openai.apiKey || ''), model: String(config.openai.model) };
  if (provider === 'compatible') return { provider: 'compatible' as const, baseURL: String(config.compatible.apiUrl), apiKey: String(config.compatible.apiKey), model: String(config.compatible.model) };
  return { provider: 'opencode' as const, baseURL: String(config.opencode.apiUrl), apiKey: String(config.opencode.apiKey), model: String(config.opencode.model) };
}
