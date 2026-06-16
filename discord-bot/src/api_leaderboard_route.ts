import { Application, Request, Response } from 'express';
import { Database } from './database';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export function registerLeaderboardRoute(app: Application, db: Database): void {
  app.get('/api/leaderboard', async (req: Request, res: Response) => {
    const rawLimit = req.query['limit'];
    let limit = DEFAULT_LIMIT;
    if (typeof rawLimit === 'string') {
      const parsed = parseInt(rawLimit, 10);
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(parsed, MAX_LIMIT);
    }

    const rawType = req.query['type'];
    const type: 'points' | 'wins' = rawType === 'wins' ? 'wins' : 'points';

    try {
      const rows = await db.getGlobalRanking(type, limit);
      const result = rows.map((row, idx) => ({
        rank: idx + 1,
        user_id: row.userId,
        user_name: row.userName,
        total_points: row.totalPoints,
        total_wins: row.totalWins,
      }));
      res.status(200).json(result);
    } catch (err) {
      console.error('[leaderboard] query error:', (err as Error).message ?? err);
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
