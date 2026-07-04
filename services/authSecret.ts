import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const secretPath = path.join(process.cwd(), 'data', '.jwt-secret');

function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return process.env.JWT_SECRET;
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Generated below.
  }
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  const generated = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(secretPath, `${generated}\n`, { mode: 0o600, flag: 'wx' });
  return generated;
}

export = { getJwtSecret };
