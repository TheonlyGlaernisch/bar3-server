import crypto from 'crypto';

type EncryptedPayload = {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
};

function requireSecret(): Buffer {
  const secret = process.env.API_KEY_ENC_SECRET;
  if (!secret) {
    throw new Error('Missing API_KEY_ENC_SECRET');
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

export function decryptString(payloadB64: string): string {
  const key = requireSecret();
  const raw = Buffer.from(payloadB64, 'base64').toString('utf8');
  const payload = JSON.parse(raw) as EncryptedPayload;
  if (payload?.v !== 1 || payload?.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted payload');
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
