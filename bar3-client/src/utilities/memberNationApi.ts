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
  }>;
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
    cache: data?.cache ?? undefined,
  };
}
