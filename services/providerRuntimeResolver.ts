const openaiService = require('./openaiService');
const ollamaService = require('./ollamaService');
const customService = require('./customService');
const codexService = require('./codexService');
const copilotService = require('./copilotService');

const services: Record<string, unknown> = {
  'ai-sdk-openai': openaiService,
  'ai-sdk-compatible': customService,
  'codex-runtime': codexService,
  'copilot-sdk': copilotService,
  'native-ollama': ollamaService
};

function getRuntimeService(runtimeAdapter?: string) {
  return services[runtimeAdapter || ''] || customService;
}

export = { getRuntimeService };
