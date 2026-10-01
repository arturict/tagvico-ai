import type { SettingsSectionId } from './types';

export const settingsSectionIds: readonly SettingsSectionId[] = [
  'paperless',
  'providers',
  'automation',
  'channels',
  'tags',
  'people'
];

/**
 * Sections that existed before and where their content lives now, so
 * bookmarked /settings/<section> links keep working. Telegram and Discord left
 * Automation for their own Channels tab; /settings/automation itself still
 * opens Automation (the page redirects an old #telegram or #discord anchor).
 */
export const legacySettingsSections: Record<string, SettingsSectionId> = {
  general: 'people',
  household: 'people',
  security: 'people',
  diagnostics: 'paperless',
  ai: 'providers',
  models: 'providers',
  'ai-models': 'providers',
  telegram: 'channels',
  discord: 'channels',
  'tag-library': 'tags'
};

/** Anchors that used to point at a channel card inside Automation. */
export const legacyChannelAnchors: readonly string[] = ['channels', 'telegram', 'discord'];

export const settingsSectionTitles: Record<SettingsSectionId, string> = {
  paperless: 'Paperless',
  providers: 'AI models',
  automation: 'Automation',
  channels: 'Channels',
  tags: 'Tags',
  people: 'People & security'
};

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return (settingsSectionIds as readonly string[]).includes(value);
}
