import axios from 'axios';
import { decryptSecret } from './secretBox';
import channelStatusService, {
  CHANNEL_ENVIRONMENT,
  externalIdPattern,
  type ChannelId,
  type ChannelStatus
} from './channelStatusService';
import { runtimeEnvironmentValue } from './runtimeEnvironment';
import setupService from './setupService';

const actionCenter = require('../models/actionCenter');

/**
 * Owner-facing configuration of the Telegram and Discord bots.
 *
 * Values are stored in the same .env file as every other setting. The bot
 * service in the backend process notices the change and reconnects (see
 * settingsRuntimeSync), and reports what happened through channelStatusService.
 * The Paperless token each allowed person acts with is copied from their
 * household profile; a profile without a token cannot be allowed, so a family
 * member never acts with someone else's permissions.
 */

export class ChannelSettingsError extends Error {
  status = 400;
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

const TOKEN_FORMAT: Record<ChannelId, { pattern: RegExp; message: string }> = {
  telegram: {
    pattern: /^\d{5,12}:[A-Za-z0-9_-]{30,60}$/,
    message: 'This does not look like a Telegram bot token. It looks like 123456789:AAH... and comes from @BotFather.'
  },
  discord: {
    pattern: /^[A-Za-z0-9._-]{40,120}$/,
    message: 'This does not look like a Discord bot token. Copy it again from the Bot page of your application.'
  }
};

const ID_MESSAGE: Record<ChannelId, string> = {
  telegram: 'A Telegram user ID is a number of up to 16 digits. Ask @userinfobot for yours.',
  discord: 'A Discord user ID is 17 to 20 digits. Turn on Developer Mode, then copy the ID of the user.'
};

export interface ChannelAllowedPerson {
  externalId: string;
  memberId: string;
  memberName: string;
}

export interface ChannelMemberOption {
  id: string;
  name: string;
  role: string;
  /** Whose Paperless token this profile acts with when allowed. */
  credential: 'profile' | 'installation' | 'missing';
}

export interface ChannelSettings {
  channel: ChannelId;
  status: ChannelStatus;
  enabled: boolean;
  tokenConfigured: boolean;
  homeChannelId: string;
  remindersEnabled: boolean;
  allowed: ChannelAllowedPerson[];
  members: ChannelMemberOption[];
  /** Setting names that the container environment fixes, so saving them here would have no effect. */
  lockedByEnvironment: string[];
}

export interface ChannelUpdate {
  enabled?: boolean;
  /** Write-only. An empty string keeps the stored token. */
  botToken?: string;
  clearToken?: boolean;
  homeChannelId?: string;
  remindersEnabled?: boolean;
  allowed?: Array<{ externalId: string; memberId: string }>;
}

interface StoredUser {
  [key: string]: unknown;
}

function installationPaperlessToken(): string {
  return runtimeEnvironmentValue('PAPERLESS_API_TOKEN');
}

/** The credential a profile acts with, or null when it has none. */
function memberCredential(householdId: string, memberId: string): { token: string; source: 'profile' | 'installation' } | null {
  const member = actionCenter.getMemberSecretRecord(householdId, memberId) as Record<string, unknown> | undefined;
  if (!member) return null;
  if (member.paperless_token_encrypted) {
    try {
      return { token: decryptSecret(String(member.paperless_token_encrypted)), source: 'profile' };
    } catch {
      return null;
    }
  }
  // The owner administers the installation, so their own profile may use the
  // installation token. Anyone else needs a token of their own.
  const installation = installationPaperlessToken();
  return member.role === 'owner' && installation ? { token: installation, source: 'installation' } : null;
}

function idKey(channel: ChannelId): string {
  return channel === 'telegram' ? 'telegramId' : 'discordId';
}

function rawUsers(channel: ChannelId): StoredUser[] {
  const raw = runtimeEnvironmentValue(CHANNEL_ENVIRONMENT[channel].users) || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry === 'object') as StoredUser[];
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([id, value]) => typeof value === 'string'
        ? { [idKey(channel)]: id, paperlessToken: value }
        : { [idKey(channel)]: id, ...(value as Record<string, unknown>) });
    }
  } catch {
    // An unreadable value is replaced the next time the allowlist is saved.
  }
  return [];
}

function entryId(channel: ChannelId, entry: StoredUser): string {
  return String(entry[idKey(channel)] ?? entry[channel === 'telegram' ? 'telegram_id' : 'discord_id'] ?? entry.id ?? '').trim();
}

function entryMemberId(entry: StoredUser): string {
  return String(entry.memberId ?? entry.member_id ?? '').trim();
}

function lockedKeys(channel: ChannelId): string[] {
  const keys = CHANNEL_ENVIRONMENT[channel];
  const labels: Array<[string, string]> = [
    [keys.enabled, 'enabled'],
    [keys.token, 'botToken'],
    [keys.users, 'allowed'],
    [keys.reminders, 'remindersEnabled']
  ];
  if (keys.home) labels.push([keys.home, 'homeChannelId']);
  return labels
    .filter(([key]) => Boolean(setupService.injectedEnvironmentValue(key)))
    .map(([, label]) => label);
}

export function getChannelSettings(channel: ChannelId, householdId: string): ChannelSettings {
  const configuration = channelStatusService.readChannelConfiguration(channel);
  const members = (actionCenter.listMembers(householdId) as Array<Record<string, unknown>>);
  const nameById = new Map(members.map((member) => [String(member.id), String(member.display_name)]));
  const allowed: ChannelAllowedPerson[] = rawUsers(channel)
    .map((entry) => ({ entry, externalId: entryId(channel, entry) }))
    .filter(({ externalId }) => externalIdPattern(channel).test(externalId))
    .map(({ entry, externalId }) => {
      const memberId = entryMemberId(entry);
      return { externalId, memberId, memberName: nameById.get(memberId) || '' };
    });
  return {
    channel,
    status: channelStatusService.channelStatus(channel),
    enabled: configuration.enabled,
    tokenConfigured: configuration.tokenConfigured,
    homeChannelId: configuration.homeChannelId,
    remindersEnabled: configuration.remindersEnabled,
    allowed,
    members: members.map((member) => ({
      id: String(member.id),
      name: String(member.display_name),
      role: String(member.role),
      credential: memberCredential(householdId, String(member.id))?.source ?? 'missing'
    })),
    lockedByEnvironment: lockedKeys(channel)
  };
}

function buildUsers(
  channel: ChannelId,
  householdId: string,
  requested: Array<{ externalId: string; memberId: string }>
): StoredUser[] {
  const existing = new Map(rawUsers(channel).map((entry) => [entryId(channel, entry), entry]));
  const seen = new Set<string>();
  const memberNames = new Map((actionCenter.listMembers(householdId) as Array<Record<string, unknown>>)
    .map((member) => [String(member.id), String(member.display_name)]));
  return requested.map((person, index) => {
    const externalId = String(person.externalId || '').trim();
    const field = `allowed.${index}.externalId`;
    if (!externalIdPattern(channel).test(externalId)) throw new ChannelSettingsError(ID_MESSAGE[channel], field);
    if (seen.has(externalId)) throw new ChannelSettingsError('This ID is already in the list.', field);
    seen.add(externalId);
    const memberId = String(person.memberId || '').trim();
    const previous = existing.get(externalId);
    // An entry that was set up outside the UI without a household profile stays as it is.
    if (previous && !memberId && !entryMemberId(previous)) return previous;
    const memberName = memberNames.get(memberId);
    if (!memberName) throw new ChannelSettingsError('Choose a person from this household.', `allowed.${index}.memberId`);
    // Keep an entry that was configured outside the UI (custom Paperless
    // address or token) untouched as long as it still points at the same person.
    if (previous && entryMemberId(previous) === memberId && String(previous.householdId ?? previous.household_id ?? '') === householdId) {
      return previous;
    }
    const credential = memberCredential(householdId, memberId);
    if (!credential) {
      throw new ChannelSettingsError(
        `${memberName} needs a Paperless token first. Add one under People & security.`,
        `allowed.${index}.memberId`
      );
    }
    return { [idKey(channel)]: externalId, householdId, memberId, paperlessToken: credential.token };
  });
}

export async function updateChannelSettings(
  channel: ChannelId,
  householdId: string,
  update: ChannelUpdate
): Promise<ChannelSettings> {
  const keys = CHANNEL_ENVIRONMENT[channel];
  const locked = new Set(lockedKeys(channel));
  const touch = (name: string) => {
    if (locked.has(name)) {
      throw new ChannelSettingsError('This value is set by the container environment and cannot be changed here.', name);
    }
  };
  const patch: Record<string, string> = {};

  if (update.enabled !== undefined) {
    touch('enabled');
    patch[keys.enabled] = update.enabled ? 'yes' : 'no';
  }
  if (update.clearToken) {
    touch('botToken');
    patch[keys.token] = '';
  }
  const botToken = (update.botToken || '').trim();
  if (botToken) {
    touch('botToken');
    if (!TOKEN_FORMAT[channel].pattern.test(botToken)) {
      throw new ChannelSettingsError(TOKEN_FORMAT[channel].message, 'botToken');
    }
    patch[keys.token] = botToken;
  }
  if (update.homeChannelId !== undefined) {
    if (!keys.home) throw new ChannelSettingsError('This channel has no home channel.', 'homeChannelId');
    touch('homeChannelId');
    const home = update.homeChannelId.trim();
    if (home && !/^\d{17,20}$/.test(home)) {
      throw new ChannelSettingsError('A Discord channel ID is 17 to 20 digits. Copy it from the channel menu with Developer Mode on.', 'homeChannelId');
    }
    patch[keys.home] = home;
  }
  if (update.remindersEnabled !== undefined) {
    touch('remindersEnabled');
    patch[keys.reminders] = update.remindersEnabled ? 'yes' : 'no';
  }
  if (update.allowed !== undefined) {
    touch('allowed');
    patch[keys.users] = JSON.stringify(buildUsers(channel, householdId, update.allowed));
  }
  if (Object.keys(patch).length) await setupService.savePartialConfig(patch);
  return getChannelSettings(channel, householdId);
}

/**
 * A profile's Paperless token changed or was removed: copy it into the
 * allowlist entries of that person so the bots keep acting with the right
 * permissions. Entries whose profile no longer has a token are dropped.
 */
export async function refreshMemberCredentials(householdId: string, memberId: string): Promise<void> {
  const patch: Record<string, string> = {};
  for (const channel of ['telegram', 'discord'] as const) {
    const users = rawUsers(channel);
    let changed = false;
    const next: StoredUser[] = [];
    for (const entry of users) {
      if (entryMemberId(entry) !== memberId || String(entry.householdId ?? entry.household_id ?? '') !== householdId) {
        next.push(entry);
        continue;
      }
      const credential = memberCredential(householdId, memberId);
      if (!credential) {
        changed = true;
        continue;
      }
      if (entry.paperlessToken !== credential.token) {
        changed = true;
        next.push({ ...entry, paperlessToken: credential.token });
      } else {
        next.push(entry);
      }
    }
    if (changed) patch[CHANNEL_ENVIRONMENT[channel].users] = JSON.stringify(next);
  }
  if (Object.keys(patch).length) await setupService.savePartialConfig(patch);
}

/** Removes a profile from every allowlist, used when a profile is deleted. */
export async function removeMemberFromChannels(householdId: string, memberId: string): Promise<void> {
  const patch: Record<string, string> = {};
  for (const channel of ['telegram', 'discord'] as const) {
    const users = rawUsers(channel);
    const next = users.filter((entry) => !(entryMemberId(entry) === memberId
      && String(entry.householdId ?? entry.household_id ?? '') === householdId));
    if (next.length !== users.length) patch[CHANNEL_ENVIRONMENT[channel].users] = JSON.stringify(next);
  }
  if (Object.keys(patch).length) await setupService.savePartialConfig(patch);
}

export interface ChannelTestResult {
  ok: true;
  label: string;
}

/** Asks the platform whether the saved bot token is accepted. No message is sent. */
export async function testChannel(channel: ChannelId): Promise<ChannelTestResult> {
  const token = runtimeEnvironmentValue(CHANNEL_ENVIRONMENT[channel].token);
  if (!token) throw new ChannelSettingsError('Save a bot token first.', 'botToken');
  try {
    if (channel === 'telegram') {
      const response = await axios.get<{ ok: boolean; result?: { username?: string } }>(
        `https://api.telegram.org/bot${token}/getMe`,
        { timeout: 8_000 }
      );
      const username = response.data?.result?.username;
      return { ok: true, label: username ? `Telegram accepts this token (@${username}).` : 'Telegram accepts this token.' };
    }
    const response = await axios.get<{ username?: string }>('https://discord.com/api/v10/users/@me', {
      timeout: 8_000,
      headers: { Authorization: `Bot ${token}` }
    });
    const username = response.data?.username;
    return { ok: true, label: username ? `Discord accepts this token (${username}).` : 'Discord accepts this token.' };
  } catch (error) {
    const platform = channel === 'telegram' ? 'Telegram' : 'Discord';
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 404) {
      throw new ChannelSettingsError(`${platform} rejected this bot token. Create a new one and save it again.`, 'botToken');
    }
    if (status) throw new ChannelSettingsError(`${platform} answered with status ${status}. Try again in a moment.`);
    throw new ChannelSettingsError(`Could not reach ${platform}. Check the internet access of this server.`);
  }
}

const channelSettingsService = {
  ChannelSettingsError,
  getChannelSettings,
  updateChannelSettings,
  refreshMemberCredentials,
  removeMemberFromChannels,
  testChannel
};

export default channelSettingsService;
module.exports = channelSettingsService;
