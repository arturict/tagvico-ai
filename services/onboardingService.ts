const fs = require('fs');
const path = require('path');

const ONBOARDING_PATH = path.join(process.cwd(), 'data', '.onboarding');

function parseOnboarding(content: unknown): Record<string, string> {
  const values: Record<string, string> = {};
  String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) values[key] = value;
    });
  return values;
}

function loadOnboardingDefaults() {
  if (!fs.existsSync(ONBOARDING_PATH)) return {};
  return parseOnboarding(fs.readFileSync(ONBOARDING_PATH, 'utf8'));
}

function writeOnboardingSnapshot(config: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(ONBOARDING_PATH), { recursive: true });
  const keys = [
    'PAPERLESS_API_URL',
    'AI_PROVIDER',
    'AI_MODEL',
    'OPENAI_MODEL',
    'OPENROUTER_MODEL',
    'OLLAMA_API_URL',
    'OLLAMA_MODEL',
    'ACTIVATE_OWNER_ASSIGNMENT',
    'OWNER_PROFILES'
  ];
  const body = [
    '# Archivista AI fast onboarding snapshot',
    '# Safe to edit; secrets stay in data/.env, not here.'
  ];
  for (const key of keys) {
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
      body.push(`${key}=${String(config[key]).replace(/\n/g, '\\n')}`);
    }
  }
  fs.writeFileSync(ONBOARDING_PATH, `${body.join('\n')}\n`);
}

module.exports = {
  loadOnboardingDefaults,
  parseOnboarding,
  writeOnboardingSnapshot
};
