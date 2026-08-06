import dotenv from 'dotenv';
dotenv.config();

const PLACEHOLDER_PREFIXES = ['your_'];

function _require(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable '${key}' is not set.`);
  }
  if (PLACEHOLDER_PREFIXES.some((p) => value.toLowerCase().startsWith(p))) {
    throw new Error(
      `Environment variable '${key}' still contains a placeholder value. ` +
      'Replace it with a real value in your .env file.'
    );
  }
  return value;
}

function _optionalInt(key: string): number | null {
  const value = process.env[key];
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable '${key}' must be an integer.`);
  }
  return parsed;
}

function _optionalString(key: string): string | null {
  const value = (process.env[key] || '').trim();
  return value ? value : null;
}

function _optionalStringList(key: string): string[] {
  const value = process.env[key] || '';
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function _optionalSnowflake(key: string): string | null {
  const value = (process.env[key] || '').trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Environment variable '${key}' must be a Discord snowflake integer string.`);
  }
  return value;
}

function _optionalIntList(key: string): Set<bigint> {
  const value = process.env[key] || '';
  const ids: bigint[] = [];
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      ids.push(BigInt(trimmed));
    } catch {
      throw new Error(
        `Environment variable '${key}' contains a non-integer value: '${trimmed}'`
      );
    }
  }
  return new Set(ids);
}

function _optionalBool(key: string, defaultValue = false): boolean {
  const value = (process.env[key] || '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(
    `Environment variable '${key}' must be a boolean-like value ` +
    "(accepted: true/false, 1/0, yes/no, on/off)."
  );
}

export const DISCORD_TOKEN: string = _require('DISCORD_TOKEN');
export const PNW_API_KEY: string = _require('PNW_API_KEY');
export const PNW_TEST_API_KEY: string = _require('PNW_TEST_API_KEY');
export const GUILD_ID: string | null = _optionalSnowflake('GUILD_ID');
export const DISCORD_ENABLE_GUILD_MEMBERS_INTENT: boolean = _optionalBool('DISCORD_ENABLE_GUILD_MEMBERS_INTENT', false);

export const VERIFIED_ROLE_ID: string | null = _optionalSnowflake('VERIFIED_ROLE_ID');
export const BAR3_CLIENT_ROLE_ID: string | null = _optionalSnowflake('BAR3_CLIENT_ROLE_ID');
export const BAR3_SERVER_ROLE_ID: string | null = _optionalSnowflake('BAR3_SERVER_ROLE_ID');
export const MEMBER_GUILD_ID: string | null = _optionalSnowflake('MEMBER_GUILD_ID');
export const MEMBER_ROLE_ID: string | null = _optionalSnowflake('MEMBER_ROLE_ID');

const _MONGODB_PASSWORD: string = _require('MONGODB_PASSWORD');
export const MONGODB_URI: string =
  `mongodb+srv://glaernischgaming_db_user:${_MONGODB_PASSWORD}` +
  '@glaernisch.0o1fjdx.mongodb.net/?appName=Glaernisch';

// HTTP API for bar3 integration.
// If API_KEY is not set the API server will not start.
export const API_KEY: string | null = process.env['API_KEY'] || null;
export const API_PORT: number = parseInt(process.env['API_PORT'] || '8080', 10);
// Secret shared with the territorial.io-winlog-worker Cloudflare Worker.
// The worker sends this value in the X-Winlog-Secret header when POSTing
// to /api/winlog. If unset, /api/winlog rejects all requests with 401.
export const WINLOG_POST_SECRET: string | null = process.env['WINLOG_POST_SECRET'] || null;

// GUILD_ID is required when the bar3 HTTP API is enabled.
if (API_KEY && GUILD_ID === null) {
  throw new Error(
    "Environment variable 'GUILD_ID' is required when 'API_KEY' is set."
  );
}

if ((MEMBER_GUILD_ID && !MEMBER_ROLE_ID) || (!MEMBER_GUILD_ID && MEMBER_ROLE_ID)) {
  throw new Error(
    "Environment variables 'MEMBER_GUILD_ID' and 'MEMBER_ROLE_ID' must either both be set or both be unset."
  );
}

// Comma-separated list of Discord user IDs that bypass all command role checks.
export const ADMIN_DISCORD_IDS: Set<bigint> = _optionalIntList('ADMIN_DISCORD_IDS');

// PnW API key used exclusively for scanning new nations.
export const PW_SCAN_API_KEY: string = process.env['PW_SCAN_API_KEY'] || '';
export const COUNTER_TRACKED_ALLIANCE_ID: number | null = _optionalInt('COUNTER_TRACKED_ALLIANCE_ID');
export const PNW_SUBSCRIPTION_GATEWAY_RESET_MINUTES: number = _optionalInt('PNW_SUBSCRIPTION_GATEWAY_RESET_MINUTES') ?? 180;

export const LOG_LEVEL: 'DEBUG' | 'INFO' =
  (process.env['LOG_LEVEL'] || '').toUpperCase() === 'DEBUG' ? 'DEBUG' : 'INFO';

export const BANKING_ENABLED: boolean = _optionalBool('BANKING_ENABLED', true);
export const BANKING_SYNC_INTERVAL_SECONDS: number = _optionalInt('BANKING_SYNC_INTERVAL_SECONDS') ?? 120;
export const BANKING_DEPOSIT_REQUIRED_WORDS: string[] = _optionalStringList('BANKING_DEPOSIT_REQUIRED_WORDS');
export const OFFSHORE_ALLIANCE_ID: number | null = _optionalInt('OFFSHORE_ALLIANCE_ID');
export const ALLIANCE_BANK_ALLIANCE_ID: number | null = _optionalInt('ALLIANCE_BANK_ALLIANCE_ID');
export const ALLIANCE_BANK_API_KEY_REF: string | null = _optionalString('ALLIANCE_BANK_API_KEY_REF');
export const OFFSHORE_API_KEY_REF: string | null = _optionalString('OFFSHORE_API_KEY_REF');
export const BOT_KEY: string | null = _optionalString('bot_key');
if (BANKING_ENABLED) {
  if (!BOT_KEY) {
    throw new Error("Environment variable 'bot_key' is required when banking is enabled.");
  }
  if (!ALLIANCE_BANK_ALLIANCE_ID) {
    throw new Error("Environment variable 'ALLIANCE_BANK_ALLIANCE_ID' is required when banking is enabled.");
  }
}

// Discord OAuth2 config — required for the /auth/* endpoints.
// Leave unset to disable the OAuth2 flow entirely.
export const DISCORD_CLIENT_ID: string = process.env['DISCORD_CLIENT_ID'] || '';
export const DISCORD_CLIENT_SECRET: string = process.env['DISCORD_CLIENT_SECRET'] || '';
export const DISCORD_REDIRECT_URI: string =
  process.env['DISCORD_REDIRECT_URI'] || 'http://localhost:8080/auth/discord/callback';
// After a successful login the browser is sent here.
// When unset, the callback falls back to '/'.
export const CLIENT_APP_URL: string = (process.env['CLIENT_APP_URL'] || '').replace(/\/$/, '');
