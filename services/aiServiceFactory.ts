const config = require('../config/config');
const { normalizeProvider } = require('./providerCatalogService');
const providerRegistryModule = require('./providerRegistry');
const providerRegistry = providerRegistryModule.default || providerRegistryModule;
const providerRuntimeResolver = require('./providerRuntimeResolver');

class AIServiceFactory {
  static getService() {
    const definition = providerRegistry.getProviderDefinition(normalizeProvider(config.aiProvider));
    return providerRuntimeResolver.getRuntimeService(definition?.runtimeAdapter);
  }
}

module.exports = AIServiceFactory;
