import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { periodId, providerCategory } from './telemetryPrivacy';

const documentModel = require('../models/document');
const reviewService = require('./reviewService');

interface TelemetryState {
  secret: string;
  lastSentAt?: string;
}

const statePath = path.join(process.cwd(), 'data', 'telemetry.json');
let timer: NodeJS.Timeout | null = null;

function enabled(env = process.env): boolean {
  return ['yes', 'true', '1', 'on'].includes(String(env.TAGVICO_TELEMETRY_ENABLED || '').toLowerCase());
}

function bucket(value: number, ranges: Array<[number, string]>): string {
  for (const [max, label] of ranges) if (value <= max) return label;
  return ranges.at(-1)?.[1] || 'unknown';
}

async function loadState(): Promise<TelemetryState> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (typeof parsed.secret === 'string') return parsed;
  } catch {
    // First opt-in/preview creates a local-only secret. It is never transmitted.
  }
  const state = { secret: crypto.randomBytes(32).toString('hex') };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  return state;
}

async function buildPayload(now = new Date()) {
  const state = await loadState();
  const processed = Number(await documentModel.getProcessedDocumentsCount()) || 0;
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const provider = String(process.env.AI_PROVIDER || 'openrouter').toLowerCase();

  return {
    schema: 1,
    daily_id: periodId(state.secret, `day:${day}`),
    monthly_id: periodId(state.secret, `month:${month}`),
    period: { day, month },
    version: String(process.env.TAGVICO_AI_VERSION || require(path.join(process.cwd(), 'package.json')).version),
    documents_processed: bucket(processed, [[0, '0'], [10, '1-10'], [100, '11-100'], [1000, '101-1000'], [Number.MAX_SAFE_INTEGER, '1000+']]),
    write_mode: reviewService.getWriteMode(),
    provider_category: providerCategory(provider),
    features: {
      ocr_rescue: String(process.env.OCR_ENABLED || process.env.MISTRAL_OCR_ENABLED || 'no') === 'yes',
      custom_fields: String(process.env.ACTIVATE_CUSTOM_FIELDS || 'yes') === 'yes',
      controlled_tags: String(process.env.CONTROLLED_TAGGING_ENABLED || 'no') === 'yes'
    }
  };
}

async function sendNow() {
  if (!enabled()) return { sent: false, reason: 'disabled' };
  const endpoint = String(process.env.TAGVICO_TELEMETRY_ENDPOINT || '').trim();
  if (!endpoint.startsWith('https://')) return { sent: false, reason: 'invalid_endpoint' };
  const payload = await buildPayload();
  await axios.post(endpoint, payload, { timeout: 5000, headers: { 'Content-Type': 'application/json' }, maxRedirects: 0 });
  const state = await loadState();
  state.lastSentAt = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log('[TELEMETRY] Shared anonymous aggregate heartbeat:', JSON.stringify(payload));
  return { sent: true };
}

function start() {
  if (timer) return;
  const run = () => sendNow().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[TELEMETRY] Heartbeat was not sent:', message);
  });
  timer = setTimeout(() => {
    void run();
    timer = setInterval(run, 24 * 60 * 60 * 1000);
  }, 15 * 60 * 1000);
  timer.unref?.();
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export = { buildPayload, enabled, sendNow, start, stop };
