import type { LanguageModel } from 'ai';

export type RuntimeProvider =
  | 'opencode'
  | 'openrouter'
  | 'openai'
  | 'compatible'
  | 'codex'
  | 'copilot'
  | 'anthropic'
  | 'ollama'
  | 'ollama-cloud';
export type RuntimeModel =
  | { kind: 'ai-sdk'; provider: RuntimeProvider; modelId: string; model: LanguageModel }
  | {
      kind: 'text-adapter';
      provider: Extract<RuntimeProvider, 'codex' | 'copilot' | 'anthropic'>;
      modelId: string;
      generateText: (prompt: string, signal?: AbortSignal) => Promise<string>;
    };

export interface AgentContext {
  householdId: string;
  memberId: string;
  sessionId: string;
}
