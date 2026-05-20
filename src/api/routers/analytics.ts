import express, {Request, Response} from 'express';

import analytics from '../../services/analytics';
import LogManager from '../../utilities/logManager';
import database from '../../services/database';

const router = express.Router();
router.use(express.json());
const apiLogs = new LogManager().updateContext('api');

function requireNameInBody(req: Request, res: Response): boolean {
  const name = req.body?.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({error: 'name is required'});
    return false;
  }
  req.body.name = name.trim();
  return true;
}

router.get('/campaigns', async (req: Request, res: Response) => {
  const logs = apiLogs.customContext(['campaign']);

  await analytics.updateAnalyticsInCampaign().catch((e) => {
    logs.logError(`Cannot update latest campaign, ${e}`);
  });

  const campaigns = await database.getAllCampaigns();

  res.status(200).contentType('json').send(campaigns).end();
});

router.post('/newCampaign', async (req: Request, res: Response) => {
  if (!requireNameInBody(req, res)) return;
  const logs = apiLogs.customContext(['newCampaign']);

  const name = req.body.name;

  await analytics.newCampaign(name).catch((e) => {
    logs.logError(`Cannot create new campaign, ${e}`);
    res.status(500).end();
    return;
  });

  res.status(200).json({ success: true });
});

router.post('/campaigns', async (req: Request, res: Response) => {
  if (!requireNameInBody(req, res)) return;
  const logs = apiLogs.customContext(['campaigns']);
  const name = req.body.name;

  await analytics.newCampaign(name).catch((e) => {
    logs.logError(`Cannot create new campaign, ${e}`);
    res.status(500).end();
    return;
  });

  if (!res.headersSent) {
    res.status(200).json({ success: true });
  }
});

export default router;
