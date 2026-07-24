import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { settingsV3PatchSchema, type SettingsV3Patch } from '../contracts/provider';
import { resolveDataDirectory } from './dataDirectory';
import {
  applyPersistedAiSelection,
  UI_MANAGED_AI_SELECTION_KEY
} from './managedAiSelection';
import setupService from './setupService';

const providerRegistryModule = require('./providerRegistry');
const providerRegistry = providerRegistryModule.default || providerRegistryModule;
const tagGroupService = require('./tagGroupService');
const runtimeConfig = require('../config/config');
const retiredProviderIds = new Set(['anthropic', 'azure']);
const externallyManagedEnvironmentKeys = new Set<string>(
  runtimeConfig.injectedEnvironment instanceof Set
    ? [...runtimeConfig.injectedEnvironment]
    : []
);

type Environment = Record<string, string | undefined>;

const sectionEnvironmentKeys = [
  'AI_PROVIDER',
  'COMPANION_PROVIDER',
  'AI_MODEL',
  'AI_REASONING_EFFORT',
  'PAPERLESS_API_URL',
  'PAPERLESS_API_TOKEN',
  'PAPERLESS_USERNAME',
  'SCAN_INTERVAL',
  'DISABLE_AUTOMATIC_PROCESSING',
  'PROCESS_PREDEFINED_DOCUMENTS',
  'AI_PROCESSING_MODE',
  'TAGVICO_WRITE_MODE',
  'USE_EXISTING_DATA',
  'ACTIVATE_CUSTOM_FIELDS',
  'ACTIVATE_OWNER_ASSIGNMENT',
  'OWNER_PROFILES',
  'CUSTOM_PROMPT',
  'SYSTEM_PROMPT',
  'CONTROLLED_TAGGING_ENABLED',
  'TAG_MAX_PER_DOCUMENT',
  'TAG_GROUPS_JSON',
  'ADD_AI_PROCESSED_TAG',
  'AI_PROCESSED_TAG_NAME',
  'ACTIVATE_TAGGING',
  'ACTIVATE_CORRESPONDENTS',
  'ACTIVATE_DOCUMENT_TYPE',
  'ACTIVATE_TITLE',
  'TAGS',
  'RESTRICT_TO_EXISTING_TAGS',
  'RESTRICT_TO_EXISTING_CORRESPONDENTS',
  'RESTRICT_TO_EXISTING_DOCUMENT_TYPES',
  'EXTERNAL_API_ENABLED',
  'EXTERNAL_API_URL',
  'EXTERNAL_API_METHOD',
  'EXTERNAL_API_TIMEOUT',
  'EXTERNAL_API_HEADERS',
  'EXTERNAL_API_BODY',
  'EXTERNAL_API_TRANSFORM',
  'CUSTOM_FIELDS',
  'API_KEY',
  'TAGVICO_TELEMETRY_ENABLED',
  'TAGVICO_AI_VERSION',
  'TAGVICO_AI_INITIAL_SETUP',
  UI_MANAGED_AI_SELECTION_KEY
];

function yes(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['yes', 'true', '1', 'on'].includes(value.toLowerCase());
}

function flag(value: boolean): string {
  return value ? 'yes' : 'no';
}

function commaList(value: string | undefined): string[] {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function normalizedPrompt(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function customFields(value: string | undefined) {
  try {
    const parsed = JSON.parse(String(value || '{"custom_fields":[]}'));
    return Array.isArray(parsed?.custom_fields) ? parsed.custom_fields : [];
  } catch {
    return [];
  }
}

function paperlessApiUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  return baseUrl ? `${baseUrl}/api` : '';
}

function publicUrl(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, raw.endsWith('/') ? '/' : '');
  } catch {
    return '';
  }
}

function normalizedTimeout(value: string | undefined): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 5_000;
  return Math.min(10_000, Math.max(1_000, parsed));
}

function writeMode(env: Environment): 'review' | 'automatic' {
  const configured = String(env.TAGVICO_WRITE_MODE || '').trim().toLowerCase();
  if (['automatic', 'auto', 'direct', 'full-access', 'full_access'].includes(configured)) return 'automatic';
  if (configured) return 'review';
  try {
    const reviewPath = path.join(resolveDataDirectory(), '.review');
    const persisted = fs.readFileSync(reviewPath, 'utf8');
    const match = persisted.match(/^\s*WRITE_MODE\s*=\s*(.+?)\s*$/m);
    return match && ['automatic', 'auto', 'direct'].includes(match[1].toLowerCase()) ? 'automatic' : 'review';
  } catch {
    return 'review';
  }
}

function trackedEnvironment(env: Environment): Record<string, string> {
  const providerKeys = providerRegistry.getProviderDefinitions().flatMap((definition: {
    modelEnvironmentKey: string;
    legacyModelEnvironmentKeys?: string[];
    fields: Array<{ environmentKey: string; legacyEnvironmentKeys?: string[] }>;
  }) => [
    definition.modelEnvironmentKey,
    ...(definition.legacyModelEnvironmentKeys || []),
    ...definition.fields.flatMap((field) => [field.environmentKey, ...(field.legacyEnvironmentKeys || [])])
  ]);
  const keys = [...new Set([...sectionEnvironmentKeys, ...providerKeys])].sort();
  return Object.fromEntries(keys.map((key) => [key, String(env[key] || '')]));
}

function revisionFor(env: Environment): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(trackedEnvironment(env)))
    .digest('hex')
    .slice(0, 24);
}

async function environment(): Promise<{ persisted: Environment; effective: Environment }> {
  const persisted = (await setupService.loadConfig()) || {};
  const effective = { ...persisted };
  // Match dotenv/config semantics: values injected by Docker or the host win
  // over the persisted .env file. Values that dotenv itself loaded are not
  // considered externally managed.
  for (const key of externallyManagedEnvironmentKeys) {
    if (process.env[key] !== undefined) effective[key] = process.env[key];
  }
  applyPersistedAiSelection(effective, persisted);
  return {
    persisted,
    effective
  };
}

export async function getEffectiveProviderEnvironment(): Promise<Environment> {
  return (await environment()).effective;
}

function publicField(field: {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  secret: boolean;
}) {
  return {
    key: field.key,
    label: field.label,
    description: field.description,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder,
    secret: field.secret
  };
}

async function getSettings() {
  const { effective } = await environment();
  const knownDefinitions = providerRegistry.getProviderDefinitions() as Array<{
    id: string;
    name: string;
    description: string;
    icon: { path: string; source?: string } | null;
    runtimeAdapter: string;
    recommended?: boolean;
    discovery: string;
    modelEnvironmentKey: string;
    legacyModelEnvironmentKeys?: string[];
    fields: Parameters<typeof publicField>[0][];
    suggestedModels: Array<{ id: string; name: string; description?: string }>;
    manualModelInput: boolean;
  }>;
  const requestedProvider = String(effective.AI_PROVIDER || effective.COMPANION_PROVIDER || 'openrouter').trim();
  const configuredProvider = retiredProviderIds.has(requestedProvider) ? 'openrouter' : requestedProvider;
  const activeDefinition = providerRegistry.getProviderDefinition(configuredProvider);
  const providers = knownDefinitions.map((definition) => ({
    instanceId: definition.id,
    driverId: definition.id,
    name: definition.name,
    description: definition.description,
    icon: definition.icon,
    runtimeAdapter: definition.runtimeAdapter,
    recommended: Boolean(definition.recommended),
    available: true,
    discovery: definition.discovery,
    manualModelInput: definition.manualModelInput,
    fields: definition.fields.map(publicField),
    configuration: Object.fromEntries(Object.entries(
      providerRegistry.readProviderConfiguration(definition, effective)
    ).map(([key, value]) => {
      const field = definition.fields.find((candidate) => candidate.key === key);
      return [key, field?.type === 'url' && typeof value === 'string' ? publicUrl(value) : value];
    })),
    suggestedModels: definition.suggestedModels
  }));
  if (!activeDefinition && configuredProvider) {
    providers.push({
      instanceId: configuredProvider,
      driverId: configuredProvider,
      name: configuredProvider,
      description: 'This provider is preserved from the existing configuration but is unavailable in this build.',
      icon: null,
      runtimeAdapter: 'unknown',
      recommended: false,
      available: false,
      discovery: 'manual',
      manualModelInput: true,
      fields: [],
      configuration: {},
      suggestedModels: []
    });
  }
  const activeModelId = activeDefinition
    ? providerRegistry.getConfiguredModel(activeDefinition, effective)
    : String(effective.AI_MODEL || '');
  const tagPolicy = tagGroupService.getConfig(effective);
  return {
    revision: revisionFor(effective),
    general: {
      telemetryEnabled: yes(effective.TAGVICO_TELEMETRY_ENABLED),
      telemetryAvailable: String(effective.TAGVICO_TELEMETRY_ENDPOINT || '').startsWith('https://')
    },
    paperless: {
      baseUrl: publicUrl(String(effective.PAPERLESS_API_URL || '').replace(/\/api\/?$/i, '')),
      username: String(effective.PAPERLESS_USERNAME || ''),
      token: { configured: Boolean(effective.PAPERLESS_API_TOKEN) }
    },
    ai: {
      activeProviderInstanceId: configuredProvider,
      activeModelId,
      modelOptions: {
        reasoningEffort: effective.AI_REASONING_EFFORT || 'auto'
      },
      providers
    },
    automation: {
      scanInterval: effective.SCAN_INTERVAL || '*/30 * * * *',
      automaticProcessing: !yes(effective.DISABLE_AUTOMATIC_PROCESSING),
      processPredefinedDocuments:
        yes(effective.PROCESS_PREDEFINED_DOCUMENTS) && commaList(effective.TAGS).length > 0,
      processingMode: ['flex', 'batch'].includes(String(effective.AI_PROCESSING_MODE))
        ? effective.AI_PROCESSING_MODE
        : 'standard',
      writeMode: writeMode(effective),
      useExistingData: yes(effective.USE_EXISTING_DATA),
      assignCustomFields: yes(effective.ACTIVATE_CUSTOM_FIELDS, true),
      assignOwner: yes(effective.ACTIVATE_OWNER_ASSIGNMENT, true),
      ownerProfiles: String(effective.OWNER_PROFILES || ''),
      customPrompt: String(effective.CUSTOM_PROMPT || effective.TAGVICO_CUSTOM_PROMPT || ''),
      advancedSystemPrompt: String(effective.SYSTEM_PROMPT || '')
    },
    tags: {
      controlled: tagPolicy.enabled,
      maximumPerDocument: tagPolicy.maximum,
      groups: tagPolicy.groups,
      vocabularySize: tagPolicy.vocabulary.length,
      addProcessedTag: yes(effective.ADD_AI_PROCESSED_TAG),
      processedTagName: effective.AI_PROCESSED_TAG_NAME || 'ai-processed',
      assignTags: yes(effective.ACTIVATE_TAGGING, true),
      assignCorrespondents: yes(effective.ACTIVATE_CORRESPONDENTS, true),
      assignDocumentType: yes(effective.ACTIVATE_DOCUMENT_TYPE, true),
      assignTitle: yes(effective.ACTIVATE_TITLE, true),
      triggerTags: commaList(effective.TAGS),
      restrictToExistingTags: yes(effective.RESTRICT_TO_EXISTING_TAGS),
      restrictToExistingCorrespondents: yes(effective.RESTRICT_TO_EXISTING_CORRESPONDENTS),
      restrictToExistingDocumentTypes: yes(effective.RESTRICT_TO_EXISTING_DOCUMENT_TYPES)
    },
    security: {
      externalApiEnabled: yes(effective.EXTERNAL_API_ENABLED),
      apiKey: { configured: Boolean(effective.API_KEY) },
      externalApiUrl: publicUrl(effective.EXTERNAL_API_URL),
      externalApiMethod: ['POST', 'PUT'].includes(String(effective.EXTERNAL_API_METHOD || '').toUpperCase())
        ? String(effective.EXTERNAL_API_METHOD).toUpperCase()
        : 'GET',
      externalApiTimeout: normalizedTimeout(effective.EXTERNAL_API_TIMEOUT),
      externalApiHeaders: { configured: Boolean(effective.EXTERNAL_API_HEADERS && effective.EXTERNAL_API_HEADERS !== '{}') },
      externalApiBody: { configured: Boolean(effective.EXTERNAL_API_BODY && effective.EXTERNAL_API_BODY !== '{}') },
      externalApiSelector: String(effective.EXTERNAL_API_TRANSFORM || ''),
      customFields: customFields(effective.CUSTOM_FIELDS)
    },
    diagnostics: {
      version: effective.TAGVICO_AI_VERSION || '3.1.2',
      configured: yes(effective.TAGVICO_AI_INITIAL_SETUP),
      providerRegistrySize: knownDefinitions.length
    }
  };
}

export class RevisionConflictError extends Error {
  status = 409;
}

function applySectionPatch(parsed: SettingsV3Patch, effective: Environment): Record<string, string> {
  const patch: Record<string, string> = {};
  const payload = parsed.patch;
  if (payload.general?.telemetryEnabled !== undefined) {
    patch.TAGVICO_TELEMETRY_ENABLED = flag(payload.general.telemetryEnabled);
  }
  if (payload.paperless) {
    if (payload.paperless.baseUrl !== undefined) {
      patch.PAPERLESS_API_URL = paperlessApiUrl(payload.paperless.baseUrl);
    }
    if (payload.paperless.username !== undefined) patch.PAPERLESS_USERNAME = payload.paperless.username;
    if (payload.paperless.token?.trim()) patch.PAPERLESS_API_TOKEN = payload.paperless.token.trim();
  }
  if (payload.provider) {
    Object.assign(
      patch,
      providerRegistry.providerValuesToEnvironment(payload.provider.instanceId, payload.provider.values)
    );
  }
  if (payload.ai) {
    const activeId = payload.ai.activeProviderInstanceId || patch.AI_PROVIDER || effective.AI_PROVIDER || 'openrouter';
    const definition = providerRegistry.getProviderDefinition(activeId);
    if (!definition) throw new Error(`Provider instance "${activeId}" is not available in this build.`);
    if (payload.ai.activeProviderInstanceId) {
      patch.AI_PROVIDER = activeId;
      patch.COMPANION_PROVIDER = activeId;
      patch[UI_MANAGED_AI_SELECTION_KEY] = 'yes';
    }
    if (payload.ai.activeModelId !== undefined) {
      patch[definition.modelEnvironmentKey] = payload.ai.activeModelId;
      patch.AI_MODEL = payload.ai.activeModelId;
      patch[UI_MANAGED_AI_SELECTION_KEY] = 'yes';
    }
    if (payload.ai.modelOptions?.reasoningEffort !== undefined) {
      patch.AI_REASONING_EFFORT = String(payload.ai.modelOptions.reasoningEffort);
      patch[UI_MANAGED_AI_SELECTION_KEY] = 'yes';
    }
  }
  if (payload.automation) {
    if (payload.automation.scanInterval !== undefined) patch.SCAN_INTERVAL = payload.automation.scanInterval;
    if (payload.automation.automaticProcessing !== undefined) {
      patch.DISABLE_AUTOMATIC_PROCESSING = flag(!payload.automation.automaticProcessing);
    }
    if (payload.automation.processingMode !== undefined) {
      patch.AI_PROCESSING_MODE = payload.automation.processingMode;
    }
    if (payload.automation.writeMode !== undefined) {
      patch.TAGVICO_WRITE_MODE = payload.automation.writeMode;
    }
    if (payload.automation.useExistingData !== undefined) patch.USE_EXISTING_DATA = flag(payload.automation.useExistingData);
    if (payload.automation.assignCustomFields !== undefined) patch.ACTIVATE_CUSTOM_FIELDS = flag(payload.automation.assignCustomFields);
    if (payload.automation.assignOwner !== undefined) patch.ACTIVATE_OWNER_ASSIGNMENT = flag(payload.automation.assignOwner);
    if (payload.automation.ownerProfiles !== undefined) patch.OWNER_PROFILES = payload.automation.ownerProfiles.replace(/\r\n/g, '\n');
    if (payload.automation.customPrompt !== undefined) patch.CUSTOM_PROMPT = normalizedPrompt(payload.automation.customPrompt);
    if (payload.automation.advancedSystemPrompt !== undefined) {
      patch.SYSTEM_PROMPT = normalizedPrompt(payload.automation.advancedSystemPrompt);
    }
  }
  if (payload.tags) {
    if (payload.tags.controlled !== undefined) patch.CONTROLLED_TAGGING_ENABLED = flag(payload.tags.controlled);
    if (payload.tags.maximumPerDocument !== undefined) {
      patch.TAG_MAX_PER_DOCUMENT = String(payload.tags.maximumPerDocument);
    }
    if (payload.tags.groups !== undefined) {
      patch.TAG_GROUPS_JSON = JSON.stringify(tagGroupService.parseGroups(payload.tags.groups));
    }
    if (payload.tags.addProcessedTag !== undefined) patch.ADD_AI_PROCESSED_TAG = flag(payload.tags.addProcessedTag);
    if (payload.tags.processedTagName !== undefined) patch.AI_PROCESSED_TAG_NAME = payload.tags.processedTagName;
    if (payload.tags.assignTags !== undefined) patch.ACTIVATE_TAGGING = flag(payload.tags.assignTags);
    if (payload.tags.assignCorrespondents !== undefined) patch.ACTIVATE_CORRESPONDENTS = flag(payload.tags.assignCorrespondents);
    if (payload.tags.assignDocumentType !== undefined) patch.ACTIVATE_DOCUMENT_TYPE = flag(payload.tags.assignDocumentType);
    if (payload.tags.assignTitle !== undefined) patch.ACTIVATE_TITLE = flag(payload.tags.assignTitle);
    if (payload.tags.triggerTags !== undefined) {
      patch.TAGS = payload.tags.triggerTags.join(',');
      patch.PROCESS_PREDEFINED_DOCUMENTS = flag(payload.tags.triggerTags.length > 0);
    }
    if (payload.tags.restrictToExistingTags !== undefined) patch.RESTRICT_TO_EXISTING_TAGS = flag(payload.tags.restrictToExistingTags);
    if (payload.tags.restrictToExistingCorrespondents !== undefined) patch.RESTRICT_TO_EXISTING_CORRESPONDENTS = flag(payload.tags.restrictToExistingCorrespondents);
    if (payload.tags.restrictToExistingDocumentTypes !== undefined) patch.RESTRICT_TO_EXISTING_DOCUMENT_TYPES = flag(payload.tags.restrictToExistingDocumentTypes);
  }
  if (payload.security) {
    if (payload.security.externalApiEnabled !== undefined) patch.EXTERNAL_API_ENABLED = flag(payload.security.externalApiEnabled);
    if (payload.security.apiKey?.trim()) patch.API_KEY = payload.security.apiKey.trim();
    if (payload.security.externalApiUrl !== undefined) patch.EXTERNAL_API_URL = payload.security.externalApiUrl;
    if (payload.security.externalApiMethod !== undefined) patch.EXTERNAL_API_METHOD = payload.security.externalApiMethod;
    if (payload.security.externalApiTimeout !== undefined) patch.EXTERNAL_API_TIMEOUT = String(payload.security.externalApiTimeout);
    if (payload.security.externalApiHeaders?.trim()) patch.EXTERNAL_API_HEADERS = payload.security.externalApiHeaders;
    if (payload.security.externalApiBody?.trim()) patch.EXTERNAL_API_BODY = payload.security.externalApiBody;
    if (payload.security.externalApiSelector !== undefined) patch.EXTERNAL_API_TRANSFORM = payload.security.externalApiSelector;
    if (payload.security.customFields !== undefined) patch.CUSTOM_FIELDS = JSON.stringify({ custom_fields: payload.security.customFields });
  }
  if (
    payload.automation?.processPredefinedDocuments !== undefined
    && payload.tags?.triggerTags === undefined
  ) {
    const triggerTags = commaList(patch.TAGS ?? effective.TAGS);
    patch.PROCESS_PREDEFINED_DOCUMENTS = flag(
      payload.automation.processPredefinedDocuments && triggerTags.length > 0
    );
  }
  return patch;
}

async function patchSettings(input: unknown) {
  const parsed = settingsV3PatchSchema.parse(input);
  const { effective } = await environment();
  if (revisionFor(effective) !== parsed.revision) {
    throw new RevisionConflictError('Settings changed in another session. Reload before saving again.');
  }
  const patch = applySectionPatch(parsed, effective);
  if (Object.keys(patch).length) await setupService.savePartialConfig(patch);
  return getSettings();
}

const settingsV3Service = {
  RevisionConflictError,
  getSettings,
  getEffectiveProviderEnvironment,
  patchSettings,
  revisionFor
};

export default settingsV3Service;
module.exports = settingsV3Service;
