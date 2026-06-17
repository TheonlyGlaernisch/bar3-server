import { AUTH_BASE_URL } from '@/utilities/serverUrls';

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string;
  total_points: number;
  total_wins: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
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

export async function fetchLeaderboard(options?: {
  limit?: number;
  type?: 'points' | 'wins';
}): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.type) params.set('type', options.type);
  const qs = params.toString();
  const res = await fetch(`${AUTH_BASE_URL}/api/leaderboard${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to load leaderboard'));
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.entries ?? []);
}
