import { AUTH_BASE_URL } from '@/utilities/serverUrls';

export interface MemberNationContextResponse {
  registered: boolean;
  nation: {
    nationId: number;
    nationName: string;
    leaderName: string;
    numCities: number;
    score: number;
    allianceId: number;
    allianceName: string;
    alliancePosition: string;
    url: string;
  } | null;
  alliance: {
    allianceId: number;
    name: string;
    acronym: string;
    rank: number;
    score: number;
    averageScore: number;
    numMembers: number;
    totalCities: number;
    url: string;
  } | null;
  activeDefensiveWars: Array<{
    warId: number;
    date: string;
    warType: string;
    attackerId: number;
    attackerName: string;
    attackerAllianceId: number;
    attackerAllianceName: string;
    defenderId: number;
    defenderName: string;
    defenderAllianceId: number;
    defenderAllianceName: string;
    url: string;
    counterRequested?: boolean;
    counterRequestedAt?: string | null;
  }>;
  nationDefensiveWars: Array<{
    warId: number;
    date: string;
    reason: string;
    attackerId: number;
    attackerName: string;
    attackerCities: number;
    attackerUnits: {
      soldiers: number;
      tanks: number;
      aircraft: number;
      ships: number;
      missiles: number;
      nukes: number;
    };
    url: string;
  }>;
  counterRequests: Array<{
    warId: number;
    requestedAt: string;
    defenderNationId: number;
    defenderDiscordId: string;
  }>;
  banking?: {
    nationBalance: Record<string, number>;
    alliancePool: Record<string, number> | null;
    lastActivity: {
      ledgerId: string;
      type: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      error: string | null;
    } | null;
  };
  cache?: {
    source: 'cache' | 'upstream';
    cachedAt: string;
    minRefreshIntervalSeconds: number;
    nextRefreshAt: string;
    canRefreshNow: boolean;
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string' && data.error) return data.error;
  } catch {
    // ignore parse errors
  }
  return fallback;
}

export async function getMemberNationContext(refresh = false): Promise<MemberNationContextResponse> {
  const query = refresh ? '?refresh=1' : '';
  const res = await fetch(`${AUTH_BASE_URL}/api/member/nation${query}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to load nation context'));
  const data = await res.json();
  return {
    registered: data?.registered === true,
    nation: data?.nation ?? null,
    alliance: data?.alliance ?? null,
    activeDefensiveWars: Array.isArray(data?.activeDefensiveWars) ? data.activeDefensiveWars : [],
    nationDefensiveWars: Array.isArray(data?.nationDefensiveWars) ? data.nationDefensiveWars : [],
    counterRequests: Array.isArray(data?.counterRequests) ? data.counterRequests : [],
    banking: data?.banking ?? undefined,
    cache: data?.cache ?? undefined,
  };
}

export async function requestCounterForWar(warId: number): Promise<void> {
  const res = await fetch(`${AUTH_BASE_URL}/api/member/nation/counter-request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to request counter'));
}

export interface WithdrawResult {
  remaining: Record<string, number>;
}

/**
 * Withdraw resources from the caller's own tracked banking balance (offshore)
 * to their registered nation, or optionally to a different nation ID.
 */
export async function withdrawFunds(
  resources: Record<string, number>,
  destinationNationId?: number | null
): Promise<WithdrawResult> {
  const body: Record<string, unknown> = { ...resources };
  if (destinationNationId) body.nationId = destinationNationId;
  const res = await fetch(`${AUTH_BASE_URL}/api/member/nation/withdraw`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to withdraw funds'));
  const data = await res.json();
  return { remaining: data?.remaining ?? {} };
}
