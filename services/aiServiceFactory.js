const config = require('../config/config');
const openaiService = require('./openaiService');
const ollamaService = require('./ollamaService');
const customService = require('./customService');
const azureService = require('./azureService');
const { normalizeProvider } = require('./providerCatalogService');

class AIServiceFactory {
  static getService() {
    switch (normalizeProvider(config.aiProvider)) {
      case 'ollama':
        return ollamaService;
      case 'openrouter':
      case 'openai':
        return openaiService;
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
