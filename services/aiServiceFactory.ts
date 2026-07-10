const config = require('../config/config');
const openaiService = require('./openaiService');
const ollamaService = require('./ollamaService');
const customService = require('./customService');
const azureService = require('./azureService');
const anthropicService = require('./anthropicService');
const codexService = require('./codexService');
const copilotService = require('./copilotService');
const { normalizeProvider } = require('./providerCatalogService');

class AIServiceFactory {
  static getService() {
    switch (normalizeProvider(config.aiProvider)) {
      case 'ollama':
      case 'ollama-cloud':
        return ollamaService;
      case 'openrouter':
      case 'openai':
        return openaiService;
      case 'opencode':
        return customService;
      case 'anthropic':
        return anthropicService;
      case 'codex':
        return codexService;
      case 'copilot':
        return copilotService;
      default:
      case 'custom':
      case 'compatible':
        return customService;
      case 'azure':
        return azureService;
    }
  }
}

module.exports = AIServiceFactory;
