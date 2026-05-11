import { API_BASE_URL } from '@/utilities/serverUrls';
import { getDiscordAuthHeaders } from '@/utilities/discordToken';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  body?: JsonValue
): Promise<Response> {
  const apiKey = localStorage.getItem('apiKey') || '';

  const headers: Record<string, string> = {
    ...getDiscordAuthHeaders(),
    ...(init.headers as Record<string, string> || {}),
  };

  if (apiKey) headers['x-api-key'] = apiKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : init.body,
  });

  return response;
}
