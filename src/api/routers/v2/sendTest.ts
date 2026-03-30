import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth';
import { MessageTemplate } from '../../../interfaces/schemas/MessageTemplateSchema';
import { getDecryptedApiKeyForAccount } from '../../../services/pwAccountService';
import messagesService from '../../../services/messages';
import { injectTrackingIntoHtml } from '../../../services/v2Analytics';
import { combineHtmlAndCss } from '../../../utilities/combineHtmlAndCss';

const router = express.Router();
router.use(express.json());

router.post('/', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id.toString();
  const nationID = Number(req.body?.nationID);
  const nationName = typeof req.body?.nationName === 'string' ? req.body.nationName : '';
  const leaderName = typeof req.body?.leaderName === 'string' ? req.body.leaderName : '';

  if (!Number.isFinite(nationID) || !nationName || !leaderName) {
    return res.status(400).json({ error: 'Missing nation data' });
  }

  const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
  if (!template) return res.status(400).json({ error: 'No saved template found for this user' });

  const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
  if (!pwKey) return res.status(500).json({ error: 'Could not decrypt user API key' });

  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');

  const configLike = {
    apiKey: pwKey,
    messageHTML: combineHtmlAndCss(template.bodyHtml || template.bodyText || '', template.bodyCss),
    messageSubject: template.subject || '',
    analyticsEnabled: false,
  } as any;

  if (baseUrl) {
    const messageId = `${accountId}-${nationID}-${Date.now()}`;
    const injected = await injectTrackingIntoHtml({
      baseUrl,
      accountId,
      messageId,
      html: configLike.messageHTML,
      trackLinks: true,
    });
    configLike.messageHTML = injected;
  }

  const msg = await messagesService.sendMessageWithConfig(configLike, {
    nation_id: nationID,
    nation: nationName,
    leader: leaderName,
  } as any);

  if (!msg?.successful) {
    return res.status(400).json({ error: msg?.error || 'Send failed' });
  }

  return res.status(200).json({ success: true });
});

export default router;

