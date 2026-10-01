import type { SettingsSectionId } from './types';

export const settingsSectionIds: readonly SettingsSectionId[] = [
  'paperless',
  'providers',
  'automation',
  'tags',
  'people'
];

/**
 * Sections that existed before v3.5 and where their content lives now, so
 * bookmarked /settings/<section> links keep working.
 */
export const legacySettingsSections: Record<string, SettingsSectionId> = {
  general: 'people',
  household: 'people',
  security: 'people',
  diagnostics: 'paperless',
  ai: 'providers',
  models: 'providers',
  'ai-models': 'providers',
  channels: 'automation',
  telegram: 'automation',
  discord: 'automation',
  'tag-library': 'tags'
};

export const settingsSectionTitles: Record<SettingsSectionId, string> = {
  paperless: 'Paperless',
  providers: 'AI models',
  automation: 'Automation',
  tags: 'Tag library',
  people: 'People & security'
};

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return (settingsSectionIds as readonly string[]).includes(value);
}
