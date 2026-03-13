import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth';
import { MessageView, TrackingLink } from '../../../interfaces/schemas/AnalyticsSchemas';
import { recordClick, recordView } from '../../../services/v2Analytics';

const router = express.Router();

// Public redirect for tracked links
router.get('/l/:shortId', async (req: Request, res: Response) => {
  const shortId = req.params.shortId;
  const link = await recordClick(shortId);
  if (!link) return res.status(404).send('Not found');
  return res.redirect(302, link.url);
});

// Public tracking pixel for views
router.get('/p/:messageId', async (req: Request, res: Response) => {
  const messageId = req.params.messageId;
  const accountId = typeof req.query.a === 'string' ? req.query.a : '';
  if (accountId) {
    await recordView(accountId, messageId).catch(() => undefined);
  }

  // 1x1 transparent gif
  const gif = Buffer.from(
    'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64'
  );
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.status(200).send(gif);
});

// Authenticated analytics summary
router.get('/me', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const links = await TrackingLink.find({ accountId }).sort({ updatedAt: -1 }).limit(200).exec();
  const views = await MessageView.find({ accountId }).sort({ updatedAt: -1 }).limit(200).exec();
  return res.status(200).json({
    links: links.map(l => ({
      shortId: l.shortId,
      url: l.url,
      clickCount: l.clickCount,
      lastClickedAt: l.clickHistory.length ? l.clickHistory[l.clickHistory.length - 1] : null,
    })),
    messages: views.map(v => ({
      messageId: v.messageId,
      viewCount: v.viewCount,
      lastViewedAt: v.viewHistory.length ? v.viewHistory[v.viewHistory.length - 1] : null,
    })),
  });
});

export default router;

