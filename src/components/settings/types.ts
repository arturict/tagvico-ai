export type ProviderOptionDescriptor =
  | {
      id: string;
      label: string;
      description?: string;
      type: 'select';
      defaultValue?: string | null;
      values: Array<{ id: string; label: string; description?: string }>;
    }
  | {
      id: string;
      label: string;
      description?: string;
      type: 'boolean';
      defaultValue?: boolean;
    };

export type ModelDescriptor = {
  id: string;
  name: string;
  isDefault: boolean;
  options: ProviderOptionDescriptor[];
  contextWindow?: number | null;
};

export type ProviderDescriptor = {
  instanceId: string;
  driverId: string;
  name: string;
  description: string;
  runtimeAdapter: string;
  recommended: boolean;
  available: boolean;
  discovery: string;
  manualModelInput: boolean;
  fields: Array<{
    key: string;
    label: string;
    description?: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
    secret: boolean;
  }>;
  configuration: Record<string, string | { configured: boolean }>;
  suggestedModels: Array<{ id: string; name: string; description?: string }>;
};

export type TagGroup = {
  id: string;
  name: string;
  enabled: boolean;
  preset?: boolean;
  permanent?: boolean;
  tags: string[];
};

export type TagUnificationSuggestion = {
  id: string;
  runId: string;
  sourceTagId: number;
  sourceTagName: string;
  sourceDocumentCount: number;
  targetTagId: number;
  targetTagName: string;
  targetDocumentCount: number;
  reason: string;
  confidence: number;
  status: 'suggested' | 'approved' | 'rejected' | 'moving' | 'moved' | 'deleting' | 'completed' | 'failed';
  currentPhase: 'move' | 'delete' | null;
  providerInstanceId: string;
  modelId: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsResponse = {
  revision: string;
  general: {
    telemetryEnabled: boolean;
    telemetryAvailable: boolean;
  };
  paperless: {
    baseUrl: string;
    username: string;
    token: { configured: boolean };
  };
  ai: {
    activeProviderInstanceId: string;
    activeModelId: string;
    modelOptions: Record<string, string | boolean>;
    providers: ProviderDescriptor[];
  };
  automation: {
    scanInterval: string;
    automaticProcessing: boolean;
    processPredefinedDocuments: boolean;
    processingMode: 'standard' | 'flex' | 'batch';
    writeMode: 'review' | 'automatic';
    useExistingData: boolean;
    assignCustomFields: boolean;
    assignOwner: boolean;
    ownerProfiles: string;
  };
  tags: {
    controlled: boolean;
    maximumPerDocument: number;
    groups: TagGroup[];
    vocabularySize: number;
    addProcessedTag: boolean;
    processedTagName: string;
    assignTags: boolean;
    assignCorrespondents: boolean;
    assignDocumentType: boolean;
    assignTitle: boolean;
    triggerTags: string[];
    restrictToExistingTags: boolean;
    restrictToExistingCorrespondents: boolean;
    restrictToExistingDocumentTypes: boolean;
  };
  security: {
    externalApiEnabled: boolean;
    apiKey: { configured: boolean };
    externalApiUrl: string;
    externalApiMethod: 'GET' | 'POST' | 'PUT';
    externalApiTimeout: number;
    externalApiHeaders: { configured: boolean };
    externalApiBody: { configured: boolean };
    externalApiSelector: string;
    customFields: Array<{
      value: string;
      data_type: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'monetary';
      currency?: string;
    }>;
  };
  diagnostics: {
    version: string;
    configured: boolean;
    providerRegistrySize: number;
  };
};

export type SettingsSectionId =
  | 'general'
  | 'paperless'
  | 'providers'
  | 'automation'
  | 'tags'
  | 'security'
  | 'diagnostics';
