import crypto from 'crypto';
import superagent from 'superagent';
import { IPnwNativeAccount, PnwNativeAccount } from '../interfaces/schemas/PnwNativeAccountSchema';

type BcryptModule = {
  hash(data: string, saltOrRounds: string | number): Promise<string>;
  compare(data: string, encrypted: string): Promise<boolean>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcrypt') as BcryptModule;

type ServiceError = { ok: false; status: number; error: string };
type ServiceOk = { ok: true };
type ServiceAccountOk = { ok: true; account: IPnwNativeAccount };

type PendingVerification = {
  nationId: number;
  username: string;
  passwordHash: string;
  code: string;
  expiresAt: number;
};

const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const BCRYPT_ROUNDS = 12;
const VERIFICATION_CODE_DIGITS = 10;
const VERIFICATION_CODE_MIN = 10 ** (VERIFICATION_CODE_DIGITS - 1);
const VERIFICATION_CODE_MAX = 10 ** VERIFICATION_CODE_DIGITS;
const CODE_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const DUMMY_PASSWORD_HASH = '$2b$12$KIX1B5Q7E09gM08fN6hKjem9eQxQxB8N6H9Q2fYMSQ3fWXwoQ9C8W';

const pendingVerifications = new Map<number, PendingVerification>();
const PNW_SUCCESS_STRING_VALUES = new Set(['true', '1', 'yes', 'ok', 'success']);
const PNW_ERROR_FIELDS = ['general_message', 'error_msg', 'message', 'error'] as const;

type SendVerificationResult = { ok: true } | { ok: false; error?: string };

function getPnwGraphqlApiKey(): string {
  return (process.env.PNW_API_KEY || '').trim();
}

function getPnwMessageSendApiKey(): string {
  return (process.env.PW_SCAN_API_KEY || '').trim() || getPnwGraphqlApiKey();
}

function nowMs(): number {
  return Date.now();
}

function isPnwSuccess(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') return PNW_SUCCESS_STRING_VALUES.has(value.trim().toLowerCase());
  return false;
}

function cleanupExpiredPending(now = nowMs()): void {
  for (const [nationId, pending] of pendingVerifications) {
    if (pending.expiresAt <= now) {
      pendingVerifications.delete(nationId);
    }
  }
}

function extractPnwError(body?: Record<string, unknown>): string | undefined {
  if (!body) return undefined;
  for (const field of PNW_ERROR_FIELDS) {
    const value = body[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

const cleanupTimer = setInterval(() => cleanupExpiredPending(), CLEANUP_INTERVAL_MS);
if (typeof (cleanupTimer as NodeJS.Timeout).unref === 'function') {
  cleanupTimer.unref();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function parseNationId(nationId: number): number {
  if (!Number.isFinite(nationId)) return 0;
  return Math.trunc(nationId);
}

function validateUsername(username: string): string | null {
  if (!USERNAME_REGEX.test(username)) {
    return 'Username must be 3-32 characters and use only letters, numbers, underscores, or hyphens.';
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return 'Password must be between 8 and 128 characters.';
  }
  return null;
}

async function nationExists(nationId: number): Promise<boolean> {
  const apiKey = getPnwGraphqlApiKey();
  if (!apiKey) {
    return false;
  }

  const endpoint = (process.env.PW_GRAPHQL_URL || 'https://api.politicsandwar.com/graphql').trim();
  const query = `
    query NationById($nationId: Int!) {
      nations(id: [$nationId], first: 1, page: 1) {
        data {
          id
        }
      }
    }
  `;

  const authModes: Array<(req: superagent.SuperAgentRequest) => superagent.SuperAgentRequest> = [
    (req) => req.query({ api_key: apiKey }),
    (req) => req.set('Authorization', `Bearer ${apiKey}`),
    (req) => req.set('X-Api-Key', apiKey),
  ];

  for (const applyAuth of authModes) {
    const response = await applyAuth(superagent.post(endpoint))
      .accept('json')
      .send({ query, variables: { nationId } })
      .ok(() => true)
      .catch(() => undefined);

    const data = ((response?.body as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined);
    const nationsContainer = data?.nations as Record<string, unknown> | undefined;
    const nations = nationsContainer?.data as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nations)) {
      continue;
    }
    if (nations.some((nation) => Number(nation?.id) === nationId)) {
      return true;
    }
  }

  return false;
}

async function sendVerificationCode(nationId: number, code: string): Promise<SendVerificationResult> {
  const apiKey = getPnwMessageSendApiKey();
  if (!apiKey) {
    return { ok: false, error: 'PnW message send API key is not configured (set PW_SCAN_API_KEY or PNW_API_KEY).' };
  }

  const message = `Your Bar3 verification code is ${code}. This code expires in 10 minutes. If you did not request this, you can ignore this message.`;
  const subject = 'TRF utilities verification code';

  const response = await superagent
    .post('https://politicsandwar.com/api/send-message')
    .accept('json')
    .type('form')
    .send({
      key: apiKey,
      to: nationId,
      subject,
      message,
    })
    .ok(() => true)
    .catch(() => undefined);

  const body = response?.body as Record<string, unknown> | undefined;
  const success = body?.success;
  if (isPnwSuccess(success)) return { ok: true };

  const responseText = typeof response?.text === 'string' ? response.text.trim().toLowerCase() : '';
  if (responseText) {
    if (PNW_SUCCESS_STRING_VALUES.has(responseText)) {
      return { ok: true };
    }

    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      if (isPnwSuccess(parsed?.success)) return { ok: true };
    } catch {
      // non-JSON response text
    }
  }

  const error = extractPnwError(body);
  return { ok: false, error };
}

export async function startVerification(
  nationIdInput: number,
  usernameInput: string,
  passwordInput: string
): Promise<ServiceOk | ServiceError> {
  cleanupExpiredPending();

  const nationId = parseNationId(nationIdInput);
  const username = normalizeUsername(usernameInput || '');
  const password = passwordInput || '';

  if (nationId <= 0) {
    return { ok: false, status: 400, error: 'Nation ID must be a positive integer.' };
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return { ok: false, status: 400, error: usernameError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, status: 400, error: passwordError };
  }

  const existingByNationId = await PnwNativeAccount.findOne({ nationId }).exec();
  if (existingByNationId) {
    return { ok: false, status: 409, error: 'Nation ID is already registered.' };
  }

  const existingByUsername = await PnwNativeAccount.findOne({ username }).exec();
  if (existingByUsername) {
    return { ok: false, status: 409, error: 'Username is already registered.' };
  }

  const nationFound = await nationExists(nationId);
  if (!nationFound) {
    return { ok: false, status: 404, error: 'Nation not found or PnW API key is not configured.' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const code = String(crypto.randomInt(VERIFICATION_CODE_MIN, VERIFICATION_CODE_MAX));

  const sent = await sendVerificationCode(nationId, code);
  if (!sent.ok) {
    const suffix = sent.error ? ` ${sent.error}` : '';
    return { ok: false, status: 502, error: `Failed to send verification code.${suffix}` };
  }

  pendingVerifications.set(nationId, {
    nationId,
    username,
    passwordHash,
    code,
    expiresAt: nowMs() + CODE_TTL_MS,
  });

  return { ok: true };
}

export async function confirmVerification(
  nationIdInput: number,
  codeInput: string
): Promise<ServiceAccountOk | ServiceError> {
  cleanupExpiredPending();

  const nationId = parseNationId(nationIdInput);
  const code = String(codeInput || '').trim();

  if (nationId <= 0) {
    return { ok: false, status: 400, error: 'Nation ID must be a positive integer.' };
  }

  if (!new RegExp(`^\\d{${VERIFICATION_CODE_DIGITS}}$`).test(code)) {
    return { ok: false, status: 400, error: `Verification code must be ${VERIFICATION_CODE_DIGITS} digits.` };
  }

  const pending = pendingVerifications.get(nationId);
  if (!pending || pending.expiresAt <= nowMs()) {
    pendingVerifications.delete(nationId);
    return { ok: false, status: 400, error: 'Verification code expired or missing. Please register again.' };
  }

  const expected = Buffer.from(pending.code, 'utf8');
  const received = Buffer.from(code, 'utf8');
  const safeReceived = received.length === expected.length
    ? received
    : Buffer.alloc(expected.length, 0);
  const isMatch = received.length === expected.length && crypto.timingSafeEqual(expected, safeReceived);

  if (!isMatch) {
    return { ok: false, status: 401, error: 'Invalid verification code.' };
  }

  const existingByNationId = await PnwNativeAccount.findOne({ nationId }).exec();
  if (existingByNationId) {
    pendingVerifications.delete(nationId);
    return { ok: false, status: 409, error: 'Nation ID is already registered.' };
  }

  const existingByUsername = await PnwNativeAccount.findOne({ username: pending.username }).exec();
  if (existingByUsername) {
    pendingVerifications.delete(nationId);
    return { ok: false, status: 409, error: 'Username is already registered.' };
  }

  const account = await PnwNativeAccount.create({
    nationId,
    username: pending.username,
    passwordHash: pending.passwordHash,
    lastLoginAt: new Date(),
  });

  pendingVerifications.delete(nationId);
  return { ok: true, account };
}

export async function login(
  usernameInput: string,
  passwordInput: string
): Promise<ServiceAccountOk | ServiceError> {
  const username = normalizeUsername(usernameInput || '');
  const password = passwordInput || '';

  const usernameError = validateUsername(username);
  if (usernameError) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return { ok: false, status: 400, error: usernameError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return { ok: false, status: 400, error: passwordError };
  }

  const account = await PnwNativeAccount.findOne({ username }).exec();
  const hashToCompare = account?.passwordHash || DUMMY_PASSWORD_HASH;
  const passwordValid = await bcrypt.compare(password, hashToCompare);

  if (!account || !passwordValid) {
    return { ok: false, status: 401, error: 'Invalid username or password.' };
  }

  account.lastLoginAt = new Date();
  await account.save();
  return { ok: true, account };
}
