const DISCORD_TOKEN_STORAGE_KEY = 'discordSessionToken';

let inMemoryDiscordToken = '';

function normalizeDiscordToken(raw: string): string {
  return raw.replace(/^Bearer\s+/i, '').trim();
}

function readStoredDiscordToken(): string {
  const raw = inMemoryDiscordToken || localStorage.getItem(DISCORD_TOKEN_STORAGE_KEY) || '';
  return normalizeDiscordToken(raw);
}

export function getDiscordToken(): string {
  return readStoredDiscordToken();
}

export function setDiscordToken(token: string): void {
  const normalized = normalizeDiscordToken(token);
  inMemoryDiscordToken = normalized;
  if (normalized) {
    localStorage.setItem(DISCORD_TOKEN_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(DISCORD_TOKEN_STORAGE_KEY);
  }
}

export function clearDiscordToken(): void {
  inMemoryDiscordToken = '';
  localStorage.removeItem(DISCORD_TOKEN_STORAGE_KEY);
}

export function getDiscordAuthHeaders(): Record<string, string> {
  const token = getDiscordToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
