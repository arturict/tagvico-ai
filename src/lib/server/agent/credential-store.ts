import 'server-only';
import type { CompanionModelSelection } from '../../../../contracts/companion';

const config = require('../../../../config/config');
const { runtimeEnvironmentValue } = require('../../../../services/runtimeEnvironment') as typeof import('../../../../services/runtimeEnvironment');

export function runtimeConfiguration(selection?: CompanionModelSelection | null) {
  const provider = String(selection?.providerInstanceId || runtimeEnvironmentValue(
    'COMPANION_PROVIDER',
    runtimeEnvironmentValue('AI_PROVIDER', config.aiProvider || 'opencode')
  )).toLowerCase();
  const selectedModel = selection?.modelId;
  if (provider === 'codex') return { provider: 'codex' as const, model: selectedModel || runtimeEnvironmentValue('CODEX_MODEL', config.codex.model) };
  if (provider === 'copilot') return { provider: 'copilot' as const, model: selectedModel || runtimeEnvironmentValue('COPILOT_MODEL', config.copilot.model) };
  if (provider === 'anthropic') return {
    provider: 'anthropic' as const,
    apiKey: runtimeEnvironmentValue('ANTHROPIC_API_KEY', config.anthropic.apiKey),
    model: selectedModel || runtimeEnvironmentValue('ANTHROPIC_MODEL', config.anthropic.model)
  };
  if (provider === 'ollama' || provider === 'ollama-cloud') return {
    provider: provider as 'ollama' | 'ollama-cloud',
    baseURL: provider === 'ollama-cloud'
      ? runtimeEnvironmentValue('OLLAMA_CLOUD_API_URL', 'https://ollama.com')
      : runtimeEnvironmentValue('OLLAMA_API_URL', config.ollama.apiUrl),
    apiKey: provider === 'ollama-cloud'
      ? runtimeEnvironmentValue('OLLAMA_CLOUD_API_KEY', '')
      : runtimeEnvironmentValue('OLLAMA_API_KEY', ''),
    model: selectedModel || (provider === 'ollama-cloud'
      ? runtimeEnvironmentValue('OLLAMA_CLOUD_MODEL', '')
      : runtimeEnvironmentValue('OLLAMA_MODEL', config.ollama.model))
  };
  if (provider === 'openrouter') return {
    provider: 'openrouter' as const,
    baseURL: runtimeEnvironmentValue('OPENROUTER_BASE_URL', config.openrouter.baseUrl),
    apiKey: runtimeEnvironmentValue('OPENROUTER_API_KEY', config.openrouter.apiKey),
    model: selectedModel || runtimeEnvironmentValue('OPENROUTER_MODEL', config.openrouter.model)
  };
  if (provider === 'openai') return {
    provider: 'openai' as const,
    apiKey: runtimeEnvironmentValue('OPENAI_API_KEY', config.openai.apiKey),
    model: selectedModel || runtimeEnvironmentValue('OPENAI_MODEL', config.openai.model)
  };
  if (provider === 'compatible') return {
    provider: 'compatible' as const,
    baseURL: runtimeEnvironmentValue('COMPATIBLE_BASE_URL', runtimeEnvironmentValue('CUSTOM_BASE_URL', config.compatible.apiUrl)),
    apiKey: runtimeEnvironmentValue('COMPATIBLE_API_KEY', runtimeEnvironmentValue('CUSTOM_API_KEY', config.compatible.apiKey)),
    model: selectedModel || runtimeEnvironmentValue('COMPATIBLE_MODEL', runtimeEnvironmentValue('CUSTOM_MODEL', config.compatible.model))
  };
  return {
    provider: 'opencode' as const,
    baseURL: runtimeEnvironmentValue('OPENCODE_BASE_URL', config.opencode.apiUrl),
    apiKey: runtimeEnvironmentValue('OPENCODE_API_KEY', config.opencode.apiKey),
    model: selectedModel || runtimeEnvironmentValue('OPENCODE_MODEL', config.opencode.model)
  };
}
