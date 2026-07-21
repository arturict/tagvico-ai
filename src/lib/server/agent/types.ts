import type { LanguageModel } from 'ai';

export type RuntimeProvider = 'opencode' | 'openrouter' | 'openai' | 'compatible' | 'codex';
export type RuntimeModel =
  | { kind: 'ai-sdk'; provider: RuntimeProvider; modelId: string; model: LanguageModel }
  | { kind: 'codex'; provider: 'codex'; modelId: string };

export interface AgentContext {
  householdId: string;
  memberId: string;
  sessionId: string;
}
