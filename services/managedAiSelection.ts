export const UI_MANAGED_AI_SELECTION_KEY = 'TAGVICO_UI_MANAGED_AI_SELECTION';

export const AI_SELECTION_ENVIRONMENT_KEYS = [
  'AI_PROVIDER',
  'COMPANION_PROVIDER',
  'AI_MODEL',
  'AI_REASONING_EFFORT',
  'OPENROUTER_MODEL',
  'OLLAMA_MODEL',
  'OLLAMA_CLOUD_MODEL',
  'OPENCODE_MODEL',
  'COPILOT_MODEL',
  'COMPATIBLE_MODEL',
  'CUSTOM_MODEL',
  'OPENAI_MODEL',
  'CODEX_MODEL'
] as const;

type Environment = Record<string, string | undefined>;

function enabled(value: string | undefined) {
  return ['yes', 'true', '1', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function applyPersistedAiSelection(
  target: Environment,
  persisted: Environment
): Environment {
  if (!enabled(persisted[UI_MANAGED_AI_SELECTION_KEY])) return target;
  target[UI_MANAGED_AI_SELECTION_KEY] = 'yes';
  for (const key of AI_SELECTION_ENVIRONMENT_KEYS) {
    if (persisted[key] !== undefined) target[key] = persisted[key];
  }
  return target;
}
