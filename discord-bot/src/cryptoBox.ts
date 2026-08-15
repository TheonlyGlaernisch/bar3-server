/**
 * Small helper for encrypting secrets (e.g. the bot-wide PnW API key) before
 * they are persisted to MongoDB, instead of storing them in plaintext.
 *
 * Mirrors server/utilities/cryptoBox.ts in the main bar3 server so both
 * services use the same at-rest protection scheme (AES-256-GCM, key derived
 * from a shared secret env var).
 */
import crypto from 'crypto';

type EncryptedPayload = {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
};

function requireSecret(): Buffer {
  const secret = process.env['API_KEY_ENC_SECRET'];
  if (!secret) {
    throw new Error(
      "Missing required environment variable 'API_KEY_ENC_SECRET' " +
        '(needed to encrypt secrets such as the bot-wide PnW API key before storing them).'
    );
  }
  // Derive a fixed-length key; avoids extra deps.
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptString(plaintext: string): string {
  const key = requireSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function tryParsePayload(payloadB64: string): EncryptedPayload | null {
  try {
    const raw = Buffer.from(payloadB64, 'base64').toString('utf8');
    const parsed = JSON.parse(raw) as EncryptedPayload;
    if (parsed && parsed.v === 1 && parsed.alg === 'aes-256-gcm' && parsed.iv && parsed.tag && parsed.ct) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function decryptString(payloadB64: string): string {
  const key = requireSecret();
  const payload = tryParsePayload(payloadB64);
  if (!payload) {
    throw new Error('Unsupported or corrupt encrypted payload');
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Returns true if the given stored value looks like a payload produced by
 * encryptString(), as opposed to a legacy plaintext value written before
 * encryption was introduced.
 */
export function isEncryptedPayload(value: string): boolean {
  return tryParsePayload(value) !== null;
}
