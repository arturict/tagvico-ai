const openaiService = require('./openaiService');
const ollamaService = require('./ollamaService');
const customService = require('./customService');
const anthropicService = require('./anthropicService');
const codexService = require('./codexService');
const copilotService = require('./copilotService');
const azureService = require('./azureService');

const services: Record<string, unknown> = {
  'ai-sdk-openai': openaiService,
  'ai-sdk-compatible': customService,
  'codex-runtime': codexService,
  'copilot-sdk': copilotService,
  'native-anthropic': anthropicService,
  'native-ollama': ollamaService,
  'native-azure': azureService
};

function getRuntimeService(runtimeAdapter?: string) {
  return services[runtimeAdapter || ''] || customService;
}

export = { getRuntimeService };
