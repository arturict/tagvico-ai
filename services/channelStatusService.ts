import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDirectory } from './dataDirectory';
import { runtimeEnvironmentValue } from './runtimeEnvironment';

/**
 * Truthful state of the Telegram and Discord bots.
 *
 * The bots run in the backend process and the web app runs in another, so the
 * backend writes what it observed (login succeeded, polling works, login was
 * rejected) to a small JSON file in the data directory and every reader derives
 * the state from that report plus the saved configuration. A report only counts
 * for the configuration it was made under, so saving new settings immediately
 * shows "configured" until the bot has confirmed them.
 */

export type ChannelId = 'telegram' | 'discord';
export type ChannelState = 'off' | 'needs-setup' | 'configured' | 'connected' | 'error';

export interface ChannelStatus {
  state: ChannelState;
  label: string;
  detail: string | null;
  enabled: boolean;
  tokenConfigured: boolean;
  allowedCount: number;
  checkedAt: string | null;
}

export type ChannelStatuses = Record<ChannelId, ChannelStatus>;

interface ChannelReport {
  state: 'connected' | 'error';
  label: string;
  detail: string | null;
  fingerprint: string;
  checkedAt: string;
}

type ReportFile = Partial<Record<ChannelId, ChannelReport>>;

/** A connected report older than this is treated as unconfirmed (the backend may be down). */
export const CONNECTED_REPORT_MAX_AGE_MS = 5 * 60 * 1000;

export const CHANNEL_ENVIRONMENT = {
  telegram: {
    enabled: 'TELEGRAM_BOT_ENABLED',
    token: 'TELEGRAM_BOT_TOKEN',
    users: 'TELEGRAM_USERS_JSON',
    reminders: 'TELEGRAM_ACTION_REMINDERS',
    home: ''
  },
  discord: {
    enabled: 'DISCORD_BOT_ENABLED',
    token: 'DISCORD_BOT_TOKEN',
    users: 'DISCORD_USERS_JSON',
    reminders: 'DISCORD_ACTION_REMINDERS',
    home: 'DISCORD_HOME_CHANNEL_ID'
  }
} as const satisfies Record<ChannelId, Record<string, string>>;

const EXTERNAL_ID = {
  telegram: /^\d{1,16}$/,
  discord: /^\d{17,20}$/
} as const;

const REPORT_FILE = 'channel-status.json';

export function isTruthy(value: string): boolean {
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function externalIdPattern(channel: ChannelId): RegExp {
  return EXTERNAL_ID[channel];
}

export interface AllowedEntry {
  externalId: string;
  householdId: string;
  memberId: string;
}

/** Entries of the saved allowlist, tolerant of the formats the bots accept. */
export function parseAllowlist(channel: ChannelId, usersJson: string): AllowedEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(usersJson || '[]');
  } catch {
    return [];
  }
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed).map(([id, value]) => typeof value === 'string'
        ? { id, token: value }
        : { id, ...(value as Record<string, unknown>) })
      : [];
  const result: AllowedEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const idKey = channel === 'telegram' ? 'telegramId' : 'discordId';
    const snakeKey = channel === 'telegram' ? 'telegram_id' : 'discord_id';
    const rawId = item[idKey] ?? item[snakeKey] ?? item.id;
    if (typeof rawId !== 'string' && !(channel === 'telegram' && typeof rawId === 'number')) continue;
    const externalId = String(rawId).trim();
    if (!EXTERNAL_ID[channel].test(externalId)) continue;
    // The bots skip entries without a Paperless token, so they do not count as allowed.
    const token = String(item.paperlessToken ?? item.paperless_token ?? item.token ?? '').trim();
    if (!token) continue;
    result.push({
      externalId,
      householdId: String(item.householdId ?? item.household_id ?? '').trim(),
      memberId: String(item.memberId ?? item.member_id ?? '').trim()
    });
  }
  return result;
}

export interface ChannelConfiguration {
  enabled: boolean;
  tokenConfigured: boolean;
  allowedCount: number;
  homeChannelId: string;
  remindersEnabled: boolean;
  /** Changes whenever a saved value the bot depends on changes; never reveals the values. */
  fingerprint: string;
}

export function readChannelConfiguration(channel: ChannelId): ChannelConfiguration {
  const keys = CHANNEL_ENVIRONMENT[channel];
  const enabled = isTruthy(runtimeEnvironmentValue(keys.enabled));
  const token = runtimeEnvironmentValue(keys.token);
  const users = runtimeEnvironmentValue(keys.users) || '[]';
  const home = keys.home ? runtimeEnvironmentValue(keys.home) : '';
  const reminders = runtimeEnvironmentValue(keys.reminders);
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify([enabled, token, users, home, reminders]))
    .digest('hex')
    .slice(0, 20);
  return {
    enabled,
    tokenConfigured: Boolean(token),
    allowedCount: parseAllowlist(channel, users).length,
    homeChannelId: home,
    remindersEnabled: reminders === '' ? true : isTruthy(reminders),
    fingerprint
  };
}

function reportPath(): string {
  return path.join(resolveDataDirectory(), REPORT_FILE);
}

function readReports(): ReportFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(reportPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed as ReportFile : {};
  } catch {
    return {};
  }
}

/** Called by the bot services (backend process) when they observe a state change or heartbeat. */
export function reportChannel(
  channel: ChannelId,
  report: { state: 'connected' | 'error'; label: string; detail?: string | null; fingerprint?: string }
): void {
  try {
    const reports = readReports();
    reports[channel] = {
      state: report.state,
      label: report.label.slice(0, 200),
      detail: report.detail ? report.detail.slice(0, 400) : null,
      // The bot states which configuration it is running, so a restart that is
      // still in progress cannot be mistaken for a verdict on the new settings.
      fingerprint: report.fingerprint ?? readChannelConfiguration(channel).fingerprint,
      checkedAt: new Date().toISOString()
    };
    const directory = path.dirname(reportPath());
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${reportPath()}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(reports), { mode: 0o600 });
    fs.renameSync(temporary, reportPath());
  } catch (error) {
    console.warn('[Channels] Could not record channel status:', error instanceof Error ? error.message : String(error));
  }
}

/** Drops a stale report, for example when the bot is disabled. */
export function clearChannelReport(channel: ChannelId): void {
  try {
    const reports = readReports();
    if (!reports[channel]) return;
    delete reports[channel];
    fs.writeFileSync(reportPath(), JSON.stringify(reports), { mode: 0o600 });
  } catch {
    // The report is advisory; a missing file already reads as "unconfirmed".
  }
}

export function channelStatus(channel: ChannelId, now = Date.now()): ChannelStatus {
  const configuration = readChannelConfiguration(channel);
  const base = {
    enabled: configuration.enabled,
    tokenConfigured: configuration.tokenConfigured,
    allowedCount: configuration.allowedCount,
    checkedAt: null as string | null
  };
  if (!configuration.enabled) {
    return { ...base, state: 'off', label: 'Off', detail: null };
  }
  if (!configuration.tokenConfigured) {
    return { ...base, state: 'needs-setup', label: 'Add a bot token', detail: null };
  }
  if (!configuration.allowedCount) {
    return { ...base, state: 'needs-setup', label: 'Allow at least one person', detail: null };
  }
  const report = readReports()[channel];
  if (report && report.fingerprint === configuration.fingerprint) {
    const age = now - Date.parse(report.checkedAt);
    if (report.state === 'error') {
      return { ...base, state: 'error', label: report.label, detail: report.detail, checkedAt: report.checkedAt };
    }
    if (Number.isFinite(age) && age <= CONNECTED_REPORT_MAX_AGE_MS) {
      return { ...base, state: 'connected', label: report.label, detail: report.detail, checkedAt: report.checkedAt };
    }
    return {
      ...base,
      state: 'configured',
      label: 'Saved, not confirmed',
      detail: 'The bot service has not reported in the last few minutes.',
      checkedAt: report.checkedAt
    };
  }
  return {
    ...base,
    state: 'configured',
    label: 'Saved, connecting',
    detail: 'Waiting for the bot service to confirm the new settings.'
  };
}

/** Synchronous, never throws and never contains a secret. Safe for server components. */
export function getChannelStatuses(now = Date.now()): ChannelStatuses {
  const fallback: ChannelStatus = {
    state: 'off', label: 'Off', detail: null, enabled: false, tokenConfigured: false, allowedCount: 0, checkedAt: null
  };
  const safe = (channel: ChannelId) => {
    try {
      return channelStatus(channel, now);
    } catch {
      return fallback;
    }
  };
  return { telegram: safe('telegram'), discord: safe('discord') };
}

const channelStatusService = {
  CHANNEL_ENVIRONMENT,
  CONNECTED_REPORT_MAX_AGE_MS,
  isTruthy,
  externalIdPattern,
  parseAllowlist,
  readChannelConfiguration,
  reportChannel,
  clearChannelReport,
  channelStatus,
  getChannelStatuses
};

export default channelStatusService;
module.exports = channelStatusService;
