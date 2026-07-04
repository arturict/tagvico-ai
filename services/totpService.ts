import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateSecret(bytes = 20) {
  const input = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) output += ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
}

function decodeBase32(value: string) {
  let bits = '';
  for (const char of value.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index >= 0) bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function token(secret: string, time = Date.now()) {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(payload).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

function verify(secret: string, candidate: string) {
  if (!/^\d{6}$/.test(candidate || '')) return false;
  return [-30000, 0, 30000].some((offset) => crypto.timingSafeEqual(Buffer.from(token(secret, Date.now() + offset)), Buffer.from(candidate)));
}

function provisioningUri(secret: string, username: string) {
  const issuer = 'Tagvico AI';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${username}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

export = { generateSecret, provisioningUri, token, verify };
