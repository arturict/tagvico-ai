import 'server-only';

const config = require('../../../../config/config');
const { runtimeEnvironmentValue } = require('../../../../services/runtimeEnvironment') as typeof import('../../../../services/runtimeEnvironment');

export function runtimeConfiguration() {
  const provider = runtimeEnvironmentValue('COMPANION_PROVIDER', runtimeEnvironmentValue('AI_PROVIDER', config.aiProvider || 'opencode')).toLowerCase();
  if (provider === 'codex') return { provider: 'codex' as const, model: runtimeEnvironmentValue('CODEX_MODEL', config.codex.model) };
  if (provider === 'openrouter') return {
    provider: 'openrouter' as const,
    baseURL: runtimeEnvironmentValue('OPENROUTER_BASE_URL', config.openrouter.baseUrl),
    apiKey: runtimeEnvironmentValue('OPENROUTER_API_KEY', config.openrouter.apiKey),
    model: runtimeEnvironmentValue('OPENROUTER_MODEL', config.openrouter.model)
  };
  if (provider === 'openai') return {
    provider: 'openai' as const,
    apiKey: runtimeEnvironmentValue('OPENAI_API_KEY', config.openai.apiKey),
    model: runtimeEnvironmentValue('OPENAI_MODEL', config.openai.model)
  };
  if (provider === 'compatible') return {
    provider: 'compatible' as const,
    baseURL: runtimeEnvironmentValue('COMPATIBLE_BASE_URL', runtimeEnvironmentValue('CUSTOM_BASE_URL', config.compatible.apiUrl)),
    apiKey: runtimeEnvironmentValue('COMPATIBLE_API_KEY', runtimeEnvironmentValue('CUSTOM_API_KEY', config.compatible.apiKey)),
    model: runtimeEnvironmentValue('COMPATIBLE_MODEL', runtimeEnvironmentValue('CUSTOM_MODEL', config.compatible.model))
  };
  return {
    provider: 'opencode' as const,
    baseURL: runtimeEnvironmentValue('OPENCODE_BASE_URL', config.opencode.apiUrl),
    apiKey: runtimeEnvironmentValue('OPENCODE_API_KEY', config.opencode.apiKey),
    model: runtimeEnvironmentValue('OPENCODE_MODEL', config.opencode.model)
  };
}
