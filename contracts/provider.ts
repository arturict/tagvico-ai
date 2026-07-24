import { z } from 'zod';

export const providerInstanceIdSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i);

export type ProviderInstanceId = z.infer<typeof providerInstanceIdSchema>;

export const providerOptionDescriptorSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    type: z.literal('select'),
    defaultValue: z.string().nullable().optional(),
    values: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional()
    })).min(1)
  }),
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    type: z.literal('boolean'),
    defaultValue: z.boolean().optional()
  })
]);

export type ProviderOptionDescriptor = z.infer<typeof providerOptionDescriptorSchema>;

export const modelDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  options: z.array(providerOptionDescriptorSchema).default([]),
  contextWindow: z.number().int().positive().nullable().optional()
});

export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;

export const providerFieldDescriptorSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['text', 'password', 'url']),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  secret: z.boolean().default(false)
});

export type ProviderFieldDescriptor = z.infer<typeof providerFieldDescriptorSchema>;

export const providerIconDescriptorSchema = z.object({
  path: z.string().min(1),
  source: z.string().url().optional()
});

export type ProviderIconDescriptor = z.infer<typeof providerIconDescriptorSchema>;

const httpUrlSchema = z.string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, 'Must be an HTTP(S) URL without embedded credentials');

const jsonSettingSchema = (maximum: number, objectOnly = false) => z.string()
  .max(maximum)
  .refine((value) => {
    if (!value.trim()) return true;
    try {
      const parsed = JSON.parse(value);
      return !objectOnly || (Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed));
    } catch {
      return false;
    }
  }, objectOnly ? 'Must be a valid JSON object' : 'Must be valid JSON');

export const settingsV3PatchSchema = z.object({
  revision: z.string().min(8),
  patch: z.object({
    general: z.object({
      telemetryEnabled: z.boolean().optional()
    }).strict().optional(),
    paperless: z.object({
      baseUrl: httpUrlSchema.optional(),
      username: z.string().trim().max(120).optional(),
      token: z.string().max(4096).optional()
    }).strict().optional(),
    ai: z.object({
      activeProviderInstanceId: providerInstanceIdSchema.optional(),
      activeModelId: z.string().trim().min(1).max(200).optional(),
      modelOptions: z.record(
        z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
        z.union([z.string().max(200), z.boolean()])
      ).optional()
    }).strict().optional(),
    provider: z.object({
      instanceId: providerInstanceIdSchema,
      values: z.record(z.union([z.string().max(4096), z.boolean()]))
    }).strict().optional(),
    automation: z.object({
      scanInterval: z.string().trim().min(1).max(120).optional(),
      automaticProcessing: z.boolean().optional(),
      processPredefinedDocuments: z.boolean().optional(),
      processingMode: z.enum(['standard', 'flex', 'batch']).optional(),
      writeMode: z.enum(['review', 'automatic']).optional(),
      useExistingData: z.boolean().optional(),
      assignCustomFields: z.boolean().optional(),
      assignOwner: z.boolean().optional(),
      ownerProfiles: z.string().max(12_000).optional(),
      customPrompt: z.string().max(20_000).optional(),
      advancedSystemPrompt: z.string().max(40_000).optional()
    }).strict().optional(),
    tags: z.object({
      controlled: z.boolean().optional(),
      maximumPerDocument: z.number().int().min(1).max(10).optional(),
      groups: z.array(z.object({
        id: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(120),
        enabled: z.boolean(),
        preset: z.boolean().optional(),
        permanent: z.boolean().optional(),
        tags: z.array(z.string().trim().min(1).max(100)).max(100)
      }).strict()).max(100).optional(),
      addProcessedTag: z.boolean().optional(),
      processedTagName: z.string().trim().min(1).max(100).optional(),
      assignTags: z.boolean().optional(),
      assignCorrespondents: z.boolean().optional(),
      assignDocumentType: z.boolean().optional(),
      assignTitle: z.boolean().optional(),
      triggerTags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
      restrictToExistingTags: z.boolean().optional(),
      restrictToExistingCorrespondents: z.boolean().optional(),
      restrictToExistingDocumentTypes: z.boolean().optional()
    }).strict().optional(),
    security: z.object({
      externalApiEnabled: z.boolean().optional(),
      apiKey: z.union([z.string().trim().min(32).max(4096), z.literal('')]).optional(),
      externalApiUrl: z.union([httpUrlSchema, z.literal('')]).optional(),
      externalApiMethod: z.enum(['GET', 'POST', 'PUT']).optional(),
      externalApiTimeout: z.number().int().min(1_000).max(10_000).optional(),
      externalApiHeaders: jsonSettingSchema(32_000, true).optional(),
      externalApiBody: jsonSettingSchema(64_000).optional(),
      externalApiSelector: z.string().max(512).optional(),
      customFields: z.array(z.object({
        value: z.string().trim().min(1).max(200),
        data_type: z.enum(['string', 'integer', 'float', 'boolean', 'date', 'monetary']),
        currency: z.string().trim().min(3).max(3).optional()
      }).strict()).max(100).optional()
    }).strict().optional()
  }).strict()
}).strict();

export type SettingsV3Patch = z.infer<typeof settingsV3PatchSchema>;

export const setupV3Schema = z.object({
  paperless: z.object({
    baseUrl: httpUrlSchema,
    token: z.string().trim().min(1).max(4096),
    username: z.string().trim().max(120).optional().default('')
  }).strict(),
  provider: z.object({
    instanceId: providerInstanceIdSchema,
    modelId: z.string().trim().max(200).optional().default(''),
    values: z.record(z.string().max(4096)).default({})
  }).strict(),
  account: z.object({
    username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    password: z.string().min(12).max(200),
    confirmPassword: z.string().min(12).max(200)
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.account.password !== value.account.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['account', 'confirmPassword'],
      message: 'Passwords do not match'
    });
  }
});

export type SetupV3 = z.infer<typeof setupV3Schema>;
