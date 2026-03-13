import crypto from 'crypto';
import superagent from 'superagent';
import { PwAccount } from '../interfaces/schemas/PwAccountSchema';
import { PwSession } from '../interfaces/schemas/PwSessionSchema';
import { decryptString, encryptString, sha256Hex } from '../utilities/cryptoBox';

async function validatePoliticsAndWarApiKey(apiKey: string): Promise<boolean> {
  // Use a lightweight query against the same API family Bar3 already uses.
  // If the key is invalid, the API typically returns success=false.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');

  const res = await superagent
    .get(`https://politicsandwar.com/api/v2/nations/${apiKey}/&max_score=1&alliance_position=0&date_created=${y}${m}${d}`)
    .accept('json')
    .then();

  const body = res?.body as any;
  return !!body?.api_request?.success;
}

export type LoginResult = {
  token: string;
  accountId: string;
};

export async function loginWithPwApiKey(pwApiKey: string): Promise<LoginResult> {
  const apiKey = pwApiKey.trim();
  if (!apiKey) throw new Error('API key required');

  const ok = await validatePoliticsAndWarApiKey(apiKey).catch(() => false);
  if (!ok) {
    const err = new Error('Invalid Politics & War API key');
    (err as any).status = 401;
    throw err;
  }

  const pwApiKeyHash = sha256Hex(apiKey);
  const pwApiKeyEnc = encryptString(apiKey);

  const account = await PwAccount.findOneAndUpdate(
    { pwApiKeyHash },
    { pwApiKeyHash, pwApiKeyEnc, lastUsedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);

  await PwSession.create({
    accountId: account._id,
    tokenHash,
    lastUsedAt: new Date(),
  });

  return { token, accountId: account._id.toString() };
}

export async function getDecryptedApiKeyForAccount(accountId: string): Promise<string> {
  const account = await PwAccount.findById(accountId).exec();
  if (!account) throw new Error('Account not found');
  return decryptString(account.pwApiKeyEnc);
}

