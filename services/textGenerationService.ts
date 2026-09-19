// One short text completion from any configured text provider, independent of
// AI_PROVIDER. The TypeSafe provider uses it for the two things a decision model
// cannot do: write a title and name a sender that is not in the archive yet.
import providerRegistry from './providerRegistry';
import { runtimeEnvironmentValue } from './runtimeEnvironment';

export type TextResult = { text: string; promptTokens: number; completionTokens: number };

const REQUEST_TIMEOUT_MS = 60_000;
const TEXT_ADAPTERS = new Set(['ai-sdk-openai', 'ai-sdk-compatible', 'native-ollama', 'codex-runtime', 'copilot-sdk']);

export function textProviderIds(): string[] {
  return providerRegistry.getProviderDefinitions()
    .filter((definition) => TEXT_ADAPTERS.has(definition.runtimeAdapter))
    .map((definition) => definition.id);
}

export async function generateWith(providerId: string, prompt: string, options: { model?: string; maxTokens?: number } = {}): Promise<TextResult> {
  const definition = providerRegistry.getProviderDefinition(providerId);
  if (!definition || !TEXT_ADAPTERS.has(definition.runtimeAdapter)) {
    throw new Error(`"${providerId}" is not a text-generating provider. Use one of: ${textProviderIds().join(', ')}`);
  }
  const environment: Record<string, string> = {};
  for (const key of [definition.modelEnvironmentKey, ...(definition.legacyModelEnvironmentKeys || [])]) environment[key] = runtimeEnvironmentValue(key);
  for (const field of definition.fields) {
    for (const key of [field.environmentKey, ...(field.legacyEnvironmentKeys || [])]) environment[key] = runtimeEnvironmentValue(key);
  }
  // Legacy keys such as AI_MODEL belong to the active provider, not to this one.
  const model = options.model || environment[definition.modelEnvironmentKey] || '';
  if (!model) throw new Error(`No model configured for ${definition.name}`);

  if (definition.runtimeAdapter === 'codex-runtime') {
    const text = await require('./codexService').generateText(prompt, undefined, { model });
    return { text: String(text || ''), promptTokens: 0, completionTokens: 0 };
  }
  if (definition.runtimeAdapter === 'copilot-sdk') {
    const text = await require('./copilotService').generateText(prompt, { model });
    return { text: String(text || ''), promptTokens: 0, completionTokens: 0 };
  }

  let baseUrl = providerRegistry.baseUrlFor(definition, environment);
  if (!baseUrl) throw new Error(`No base URL configured for ${definition.name}`);
  // Ollama serves its OpenAI-compatible API under /v1.
  if (definition.runtimeAdapter === 'native-ollama') baseUrl = `${baseUrl}/v1`;
  const apiKey = providerRegistry.secretFor(definition, environment);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: options.maxTokens || 600 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${definition.name} returned HTTP ${response.status}`);
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: String(body.choices?.[0]?.message?.content || ''),
    promptTokens: Number(body.usage?.prompt_tokens || 0),
    completionTokens: Number(body.usage?.completion_tokens || 0)
  };
}
