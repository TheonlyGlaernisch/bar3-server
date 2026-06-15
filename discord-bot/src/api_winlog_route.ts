import { Application, Request, Response } from 'express';
import { WinlogPayload } from './winlog';

export function registerWinlogRoute(
  app: Application,
  winlogSecret: string | null | undefined,
  winlogHandler: ((payload: WinlogPayload) => Promise<void>) | undefined,
): void {
  app.post('/api/winlog', async (req: Request, res: Response) => {
    if (!winlogSecret) {
      res.status(401).json({ error: 'Winlog not configured' });
      return;
    }

    const providedSecret = req.headers['x-winlog-secret'];
    if (providedSecret !== winlogSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    // Basic payload validation
    if (
      typeof body['winTime'] !== 'string' ||
      typeof body['map'] !== 'string' ||
      typeof body['winningClan'] !== 'string' ||
      typeof body['points'] !== 'number' ||
      !Array.isArray(body['payoutAccounts'])
    ) {
      res.status(400).json({ error: 'Invalid winlog payload' });
      return;
    }

    const payload: WinlogPayload = {
      winTime: body['winTime'],
      map: body['map'],
      playerCount: typeof body['playerCount'] === 'number' ? body['playerCount'] : 0,
      winningClan: body['winningClan'],
      isContest: Boolean(body['isContest']),
      points: body['points'],
      prevPoints: typeof body['prevPoints'] === 'string' ? body['prevPoints'] : String(body['prevPoints'] ?? ''),
      currPoints: typeof body['currPoints'] === 'string' ? body['currPoints'] : String(body['currPoints'] ?? ''),
      payoutAccounts: (body['payoutAccounts'] as unknown[]).map(String),
    };

    if (!winlogHandler) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }

    try {
      await winlogHandler(payload);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[winlog] Handler error:', (err as Error).message ?? err);
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
