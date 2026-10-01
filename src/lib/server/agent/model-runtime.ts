import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import type { CompanionModelSelection } from '../../../../contracts/companion';
import { runtimeConfiguration } from './credential-store';
import type { RuntimeModel } from './types';
import { RESOURCE } from '../../../../services/chatgptPlanAuthService';
import { chatgptPlanFetch } from '../../../../services/chatgptPlanFetch';
import codexService from '../../../../services/codexService';
import copilotService from '../../../../services/copilotService';

export function resolveRuntimeModel(selection?: CompanionModelSelection | null): RuntimeModel {
  const selected = runtimeConfiguration(selection);
  if (!selected.model) throw new Error(`No model configured for ${selected.provider}`);
  if (selected.provider === 'chatgpt') {
    // The plan speaks the public Responses API, so the chat runs the same tool
    // loop as the OpenAI API; the fetch swaps the API key for the plan token
    // and applies the plan's request contract.
    const plan = createOpenAI({ apiKey: 'chatgpt-plan', baseURL: RESOURCE, fetch: chatgptPlanFetch });
    return { kind: 'ai-sdk', provider: 'chatgpt', modelId: selected.model, model: plan.responses(selected.model) };
  }
  if (selected.provider === 'codex') {
    return {
      kind: 'text-adapter',
      provider: 'codex',
      modelId: selected.model,
      generateText: (prompt, signal) => codexService.generateText(prompt, signal, {
        model: selected.model,
        reasoningEffort: selection?.reasoningEffort
      })
    };
  }
  if (selected.provider === 'copilot') {
    return {
      kind: 'text-adapter',
      provider: 'copilot',
      modelId: selected.model,
      generateText: (prompt) => copilotService.generateText(prompt, {
        model: selected.model,
        reasoningEffort: selection?.reasoningEffort
      })
    };
  }
  if (!selected.apiKey && selected.provider !== 'ollama') {
    throw new Error(`No API key configured for ${selected.provider}`);
  }
  if (selected.provider === 'openai') {
    const openai = createOpenAI({ apiKey: selected.apiKey });
    return { kind: 'ai-sdk', provider: 'openai', modelId: selected.model, model: openai(selected.model) };
  }
  if (!selected.baseURL) throw new Error(`No base URL configured for ${selected.provider}`);
  const baseURL = selected.provider === 'ollama' || selected.provider === 'ollama-cloud'
    ? `${selected.baseURL.replace(/\/+$/, '')}/v1`
    : selected.baseURL;
  const compatible = createOpenAICompatible({
    name: selected.provider,
    baseURL,
    apiKey: selected.apiKey || 'ollama'
  });
  return { kind: 'ai-sdk', provider: selected.provider, modelId: selected.model, model: compatible.chatModel(selected.model) };
}
