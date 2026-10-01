import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDirectory } from './dataDirectory';

/**
 * Settings are saved by the web process into the shared data directory's .env.
 * The backend process hosts the bots and the Paperless client, so it has to
 * notice those saves. This module polls the file (as the scan scheduler does),
 * reloads the runtime configuration, drops the cached Paperless client when its
 * URL or token changed, and tells the registered listeners (the bots) to
 * reconcile with the new settings.
 *
 * It polls instead of using fs.watchFile because the scan scheduler removes
 * every watcher on that file when it registers, which would silently drop ours.
 */

type Listener = () => void | Promise<void>;

const POLL_INTERVAL_MS = 2_000;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastSignature = '';
let paperlessSignature = '';
let running = false;

function signature(): string {
  try {
    const stats = fs.statSync(path.join(resolveDataDirectory(), '.env'));
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return '';
  }
}

function currentPaperlessSignature(): string {
  const config = require('../config/config');
  return `${config.paperless?.apiUrl || ''}|${config.paperless?.apiToken || ''}`;
}

export async function reconcile(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const setupService = require('./setupService');
    setupService.reloadRuntimeConfig();
    const nextPaperless = currentPaperlessSignature();
    if (nextPaperless !== paperlessSignature) {
      paperlessSignature = nextPaperless;
      // The client is created once from the URL and token that were current at
      // that moment; without a reset a saved connection change would be ignored
      // until the next restart.
      require('./paperlessService').reset();
    }
    // Provider clients capture the key and address they were created with.
    // Dropping them is cheap and makes a saved provider change take effect now.
    const providerServices: Array<() => { reset?: () => void }> = [
      () => require('./openaiService'),
      () => require('./ollamaService'),
      () => require('./customService'),
      () => require('./azureService'),
      () => require('./anthropicService'),
      () => require('./typesafeService')
    ];
    for (const load of providerServices) {
      try {
        load().reset?.();
      } catch (error) {
        console.warn('[Settings] Could not refresh a provider client:', error instanceof Error ? error.message : String(error));
      }
    }
    for (const listener of listeners) {
      try {
        await listener();
      } catch (error) {
        console.warn('[Settings] Could not apply saved settings:', error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    running = false;
  }
}

/** Starts watching once; later calls only add the listener. */
export function onSettingsChange(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer) {
    lastSignature = signature();
    paperlessSignature = currentPaperlessSignature();
    timer = setInterval(() => {
      const next = signature();
      if (next === lastSignature) return;
      lastSignature = next;
      void reconcile();
    }, POLL_INTERVAL_MS);
    timer.unref?.();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const settingsRuntimeSync = { onSettingsChange, reconcile };
export default settingsRuntimeSync;
module.exports = settingsRuntimeSync;
