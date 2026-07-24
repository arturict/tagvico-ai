const cron = require('node-cron');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config/config');
const { resolveDataDirectory } = require('./dataDirectory');

type ScanCallback = () => Promise<void> | void;
type ReloadCallback = () => void;
type ScheduledTask = { stop?: () => void; destroy?: () => void };

let callback: ScanCallback | null = null;
let reloadCallback: ReloadCallback | null = null;
let task: ScheduledTask | null = null;
let watchedPath = '';

function clearTask() {
  task?.stop?.();
  task?.destroy?.();
  task = null;
}

function refresh() {
  clearTask();
  if (!callback || config.disableAutomaticProcessing === 'yes') {
    return { scheduled: false, reason: 'disabled' as const };
  }
  const expression = String(config.scanInterval || '').trim();
  if (!cron.validate(expression)) {
    console.error(`[ERROR] Invalid scan interval "${expression}". Automatic scanning is not scheduled.`);
    return { scheduled: false, reason: 'invalid-interval' as const };
  }
  task = cron.schedule(expression, async () => {
    console.log(`Starting scheduled scan at ${new Date().toISOString()}`);
    await callback?.();
  });
  console.log(`Automatic document scan scheduled with "${expression}"`);
  return { scheduled: true, expression };
}

function register(scan: ScanCallback, reload?: ReloadCallback) {
  callback = scan;
  reloadCallback = reload || null;
  watchedPath = path.join(resolveDataDirectory(), '.env');
  fs.unwatchFile(watchedPath);
  fs.watchFile(watchedPath, { interval: 1_000 }, () => {
    try {
      reloadCallback?.();
      refresh();
    } catch (error) {
      console.error('[ERROR] Could not reload the automatic scan schedule:', error);
    }
  });
  return refresh();
}

function reset() {
  clearTask();
  if (watchedPath) fs.unwatchFile(watchedPath);
  watchedPath = '';
  callback = null;
  reloadCallback = null;
}

export = { register, refresh, reset };
