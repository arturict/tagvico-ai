import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDirectory } from './dataDirectory';

const secretPath = path.join(resolveDataDirectory(), '.jwt-secret');

function readStoredSecret(): string | null {
  try {
    const value = fs.readFileSync(secretPath, 'utf8').trim();
    if (value.length < 32) throw new Error('Stored JWT secret is invalid; restore data/.jwt-secret from backup');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
    return process.env.JWT_SECRET;
  }
  const existing = readStoredSecret();
  if (existing) return existing;
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  const generated = crypto.randomBytes(64).toString('hex');
  try {
    fs.writeFileSync(secretPath, `${generated}\n`, { mode: 0o600, flag: 'wx' });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const raced = readStoredSecret();
    if (!raced) throw error;
    return raced;
  }
}

const authSecret = { getJwtSecret };
export default authSecret;
module.exports = authSecret;
