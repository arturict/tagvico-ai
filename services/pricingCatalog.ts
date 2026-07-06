'use strict';

/**
 * Dynamic token-pricing catalog.
 *
 * Fetches an up-to-date, provider-wide price list from models.dev
 * (https://models.dev/api.json) and caches it on disk under `data/` with a
 * TTL. Lookups are synchronous and read from the in-memory cache, so the
 * dashboard render never blocks on the network. Refreshes happen in the
 * background, and everything degrades gracefully when offline: if no cache
 * exists yet, lookups simply return null and the caller falls back to the
 * curated static price book in modelPricing.ts.
 *
 * models.dev shape (per provider):
 *   { [providerId]: { models: { [modelId]: { name, cost: { input, output } } } } }
 * where cost.input / cost.output are USD per 1,000,000 tokens.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

interface CatalogEntry {
  input: number;
  output: number;
  label: string;
}

interface CatalogFile {
  fetchedAt: number;
  source: string;
  // keyed by normalised model id (no provider prefix, no version suffix)
  models: Record<string, CatalogEntry>;
}

const SOURCE_URL = 'https://models.dev/api.json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const FETCH_TIMEOUT_MS = 8000;

const dataDir = path.join(process.cwd(), 'data');
const cachePath = path.join(dataDir, 'model-pricing-cache.json');

let memoryCache: CatalogFile | null = null;
let refreshing = false;

function normalizeKey(modelId: string): string {
  return String(modelId ?? '')
    .toLowerCase()
    .trim()
    .replace(/^[a-z0-9.-]+\//, '')
    .replace(/:[a-z0-9-]+$/, '');
}

function toPrice(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * Flatten the models.dev document into a normalised { modelId -> price } map.
 * When several providers expose the same model id, the cheapest input rate
 * wins so estimates stay conservative.
 */
function buildCatalog(raw: unknown): Record<string, CatalogEntry> {
  const models: Record<string, CatalogEntry> = {};
  if (!raw || typeof raw !== 'object') return models;

  for (const provider of Object.values(raw as Record<string, unknown>)) {
    const providerModels = (provider as { models?: unknown })?.models;
    if (!providerModels || typeof providerModels !== 'object') continue;

    for (const [modelId, model] of Object.entries(providerModels as Record<string, unknown>)) {
      const cost = (model as { cost?: { input?: unknown; output?: unknown } })?.cost;
      if (!cost) continue;
      const input = toPrice(cost.input);
      const output = toPrice(cost.output);
      if (!Number.isFinite(input) || !Number.isFinite(output)) continue;

      const label = String((model as { name?: unknown })?.name || modelId);
      const key = normalizeKey(modelId);
      if (!key) continue;

      const existing = models[key];
      if (!existing || input < existing.input) {
        models[key] = { input, output, label };
      }
    }
  }
  return models;
}

function readDiskCache(): CatalogFile | null {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as CatalogFile;
    if (parsed && parsed.models && typeof parsed.models === 'object') return parsed;
  } catch {
    // corrupt cache is ignored; a refresh will rewrite it
  }
  return null;
}

function writeDiskCache(file: CatalogFile): void {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(file), 'utf8');
  } catch {
    // best-effort; failing to persist just means we refetch next boot
  }
}

function fetchRaw(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { accept: 'application/json' } }, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Unexpected status ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(new Error('Pricing fetch timed out')));
  });
}

/**
 * Refresh the catalog from models.dev in the background. Never throws; on any
 * failure it silently keeps the existing cache (or none).
 */
async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const raw = await fetchRaw(SOURCE_URL);
    const models = buildCatalog(raw);
    if (Object.keys(models).length > 0) {
      const file: CatalogFile = { fetchedAt: Date.now(), source: SOURCE_URL, models };
      memoryCache = file;
      writeDiskCache(file);
      console.log(`[INFO] Model pricing catalog refreshed from models.dev (${Object.keys(models).length} models)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[WARNING] Could not refresh model pricing from models.dev; using cached/static prices: ${message}`);
  } finally {
    refreshing = false;
  }
}

function ensureLoaded(): CatalogFile | null {
  if (!memoryCache) memoryCache = readDiskCache();
  const stale = !memoryCache || Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS;
  if (stale) {
    // Fire-and-forget; current request uses whatever cache we already have.
    void refresh();
  }
  return memoryCache;
}

/**
 * Synchronous price lookup for a normalised model id. Returns null when the
 * dynamic catalog has no entry (caller should fall back to the static book).
 */
function lookupPrice(modelId: unknown): { input: number; output: number; label: string } | null {
  const catalog = ensureLoaded();
  if (!catalog) return null;
  const key = normalizeKey(String(modelId ?? ''));
  if (!key) return null;

  const exact = catalog.models[key];
  if (exact) return { ...exact };

  // Fall back to the longest catalog key that the model id contains, so dated
  // aliases (e.g. "gpt-5.4-mini-2026-03-17") still resolve to their family.
  let best: CatalogEntry | null = null;
  let bestLen = 0;
  for (const [catalogKey, entry] of Object.entries(catalog.models)) {
    if (catalogKey.length > bestLen && key.includes(catalogKey)) {
      best = entry;
      bestLen = catalogKey.length;
    }
  }
  return best ? { ...best } : null;
}

/** Kick off an initial background refresh at startup. */
function warmUp(): void {
  ensureLoaded();
}

module.exports = { lookupPrice, refresh, warmUp, normalizeKey };
