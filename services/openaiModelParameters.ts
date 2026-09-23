/**
 * Request-parameter rules for OpenAI reasoning models (GPT-5 and later, the
 * o-series), shared by every path that sends an OpenAI model id to Chat
 * Completions or the Responses API, directly or through OpenRouter.
 *
 * Source: OpenAI's GPT-6 migration guide (developers.openai.com, checked
 * 2026-09-23). Reasoning models reject temperature, top_p and logprobs unless
 * the reasoning effort is "none"; Tagvico simply omits them for these models.
 */

/** Model id without a routing prefix such as `openai/` (OpenRouter). */
export function bareModelId(model: unknown): string {
  return (String(model || '').split('/').at(-1) || '').toLowerCase();
}

export function isOpenAIReasoningModel(model: unknown): boolean {
  const id = bareModelId(model);
  if (/^o\d/.test(id)) return true;
  return /^gpt-(?:[5-9]|\d{2,})(?:[.-]|$)/.test(id) && !id.startsWith('gpt-5-chat');
}

export function isGpt6Model(model: unknown): boolean {
  return /^gpt-6(?:[.-]|$)/.test(bareModelId(model));
}

/**
 * Maps Tagvico's provider-neutral AI_REASONING_EFFORT onto a value the model
 * accepts, or undefined for "auto" (let the provider default apply).
 * GPT-6 accepts none, low, medium, high, xhigh and max; "minimal" and
 * Tagvico's "ultra" are not OpenAI values, and GPT-6 Astra cannot skip
 * reasoning. Other models receive the configured value unchanged.
 */
export function openAIReasoningEffort(model: unknown, effort: unknown): string | undefined {
  const value = String(effort || 'auto');
  if (value === 'auto') return undefined;
  if (!isGpt6Model(model)) return value;
  if (value === 'minimal') return 'low';
  if (value === 'ultra') return 'max';
  if (value === 'none' && bareModelId(model).startsWith('gpt-6-astra')) return 'low';
  return value;
}

/**
 * Effort for a Chat Completions request that carries tools. GPT-6 Luna and Sol
 * accept tools there only at "none"; reasoning with tools needs the Responses
 * API. Earlier reasoning models accept tools at "low".
 */
export function chatCompletionsToolReasoningEffort(model: unknown): 'none' | 'low' {
  return isGpt6Model(model) && !bareModelId(model).startsWith('gpt-6-astra') ? 'none' : 'low';
}
