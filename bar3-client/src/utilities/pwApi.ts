/**
 * Politics & War GraphQL API utilities.
 * Fetches per-user API key details (daily request usage).
 */

const PW_GRAPHQL_URL = 'https://api.politicsandwar.com/graphql';

export interface PwApiKeyDetails {
  used: number;
  max: number;
}

/**
 * Fetch the current user's P&W API key request usage.
 * Uses the P&W GraphQL v3 `me` query which returns `requests` (used today)
 * and `max_requests` (daily cap) scoped to the authenticated API key.
 * Returns { used: 0, max: 0 } on any error.
 */
export async function getPwApiKeyDetails(apiKey: string): Promise<PwApiKeyDetails> {
  try {
    const query = '{ me { requests max_requests } }';
    const url = `${PW_GRAPHQL_URL}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { used: 0, max: 0 };

    const data = await res.json();
    const me = data?.data?.me;
    if (!me) return { used: 0, max: 0 };

    return {
      used: me.requests ?? 0,
      max: me.max_requests ?? 0,
    };
  } catch {
    return { used: 0, max: 0 };
  }
}
