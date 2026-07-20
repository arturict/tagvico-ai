import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { runtimeConfiguration } from './credential-store';
import type { RuntimeModel } from './types';

export function resolveRuntimeModel(): RuntimeModel {
  const selected = runtimeConfiguration();
  if (!selected.model) throw new Error(`No model configured for ${selected.provider}`);
  if (selected.provider === 'codex') return { kind: 'codex', provider: 'codex', modelId: selected.model };
  if (!selected.apiKey) throw new Error(`No API key configured for ${selected.provider}`);
  if (selected.provider === 'openai') {
    const openai = createOpenAI({ apiKey: selected.apiKey });
    return { kind: 'ai-sdk', provider: 'openai', modelId: selected.model, model: openai(selected.model) };
  }
  if (!selected.baseURL) throw new Error(`No base URL configured for ${selected.provider}`);
  const compatible = createOpenAICompatible({ name: selected.provider, baseURL: selected.baseURL, apiKey: selected.apiKey });
  return { kind: 'ai-sdk', provider: selected.provider, modelId: selected.model, model: compatible.chatModel(selected.model) };
}
