const MODES = new Set(['standard', 'flex', 'batch']);

function normalizeProcessingMode(value: unknown, provider = ''): string {
  const mode = MODES.has(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'standard';

  if (mode === 'flex' && provider !== 'openai') return 'standard';
  if (mode === 'batch' && !['openai', 'anthropic'].includes(provider)) return 'standard';
  return mode;
}

module.exports = { normalizeProcessingMode };
