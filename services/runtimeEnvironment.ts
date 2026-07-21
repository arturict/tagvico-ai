import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolveDataDirectory } from './dataDirectory';

const config = require('../config/config');

function savedEnvironment(): Record<string, string> {
  try {
    return dotenv.parse(fs.readFileSync(path.join(resolveDataDirectory(), '.env')));
  } catch {
    return {};
  }
}

/**
 * Resolve configuration that may have been saved after the web process began.
 * Explicit container/process environment always wins; setup-owned values are
 * re-read from the shared data directory so first-run and Settings changes do
 * not require restarting the separate Next.js process.
 */
export function runtimeEnvironmentValue(name: string, fallback: unknown = '') {
  const injected = config.injectedEnvironment instanceof Set && config.injectedEnvironment.has(name);
  if (injected && process.env[name] !== undefined) return String(process.env[name]).trim();
  const saved = savedEnvironment()[name];
  return String(saved ?? process.env[name] ?? fallback ?? '').trim();
}
