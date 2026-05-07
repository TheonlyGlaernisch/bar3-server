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

export const DISCORD_TOKEN: string = _require('DISCORD_TOKEN');
export const PNW_API_KEY: string = _require('PNW_API_KEY');
export const PNW_TEST_API_KEY: string = _require('PNW_TEST_API_KEY');
export const GUILD_ID: number | null = _optionalInt('GUILD_ID');

export const VERIFIED_ROLE_ID: number | null = _optionalInt('VERIFIED_ROLE_ID');
export const BAR3_CLIENT_ROLE_ID: number | null = _optionalInt('BAR3_CLIENT_ROLE_ID');
export const BAR3_SERVER_ROLE_ID: number | null = _optionalInt('BAR3_SERVER_ROLE_ID');

const _MONGODB_PASSWORD: string = _require('MONGODB_PASSWORD');
export const MONGODB_URI: string =
  `mongodb+srv://glaernischgaming_db_user:${_MONGODB_PASSWORD}` +
  '@glaernisch.0o1fjdx.mongodb.net/?appName=Glaernisch';

// HTTP API for bar3 integration.
// If API_KEY is not set the API server will not start.
export const API_KEY: string | null = process.env['API_KEY'] || null;
export const API_PORT: number = parseInt(process.env['API_PORT'] || '8080', 10);

// GUILD_ID is required when the bar3 HTTP API is enabled.
if (API_KEY && GUILD_ID === null) {
  throw new Error(
    "Environment variable 'GUILD_ID' is required when 'API_KEY' is set."
  );
}

// Comma-separated list of Discord user IDs that bypass all command role checks.
export const ADMIN_DISCORD_IDS: Set<bigint> = _optionalIntList('ADMIN_DISCORD_IDS');

// PnW API key used exclusively for scanning new nations.
export const PW_SCAN_API_KEY: string = process.env['PW_SCAN_API_KEY'] || '';

export const LOG_LEVEL: 'DEBUG' | 'INFO' =
  (process.env['LOG_LEVEL'] || '').toUpperCase() === 'DEBUG' ? 'DEBUG' : 'INFO';

// Discord OAuth2 config — required for the /auth/* endpoints.
// Leave unset to disable the OAuth2 flow entirely.
export const DISCORD_CLIENT_ID: string = process.env['DISCORD_CLIENT_ID'] || '';
export const DISCORD_CLIENT_SECRET: string = process.env['DISCORD_CLIENT_SECRET'] || '';
export const DISCORD_REDIRECT_URI: string =
  process.env['DISCORD_REDIRECT_URI'] || 'http://localhost:8080/auth/discord/callback';
// After a successful login the browser is sent here.
// When unset, the callback falls back to '/'.
export const CLIENT_APP_URL: string = (process.env['CLIENT_APP_URL'] || '').replace(/\/$/, '');
