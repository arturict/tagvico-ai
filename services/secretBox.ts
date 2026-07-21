import crypto from 'node:crypto';
import authSecret from './authSecret';

const VERSION = 'v1';
const key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(authSecret.getJwtSecret(), 'utf8'), Buffer.from('tagvico-secret-box'), Buffer.from('paperless-member-token'), 32));

export function encryptSecret(plaintext: string): string {
  const value = String(plaintext || '').trim();
  if (!value) throw new Error('Secret cannot be empty');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(encoded: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = String(encoded || '').split('.');
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error('Unsupported encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}
