const FALLBACK_SERVER_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

function normalizeBaseUrl(value: string): string {
  // Keep URL joining predictable by removing trailing slashes.
  return value.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(
  process.env.VUE_APP_API_URL ||
    process.env.VUE_APP_SERVER_URL ||
    FALLBACK_SERVER_URL
);

export const AUTH_BASE_URL = normalizeBaseUrl(
  process.env.VUE_APP_AUTH_URL || API_BASE_URL
);

export function normalizeReturnTo(value: unknown): string | undefined {
  // Accept only app-internal relative paths to avoid open-redirect vectors.
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
}
