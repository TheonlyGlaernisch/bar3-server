import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth';
import { AutomationSettings } from '../../../interfaces/schemas/AutomationSettingsSchema';

const router = express.Router();
router.use(express.json());

router.get('/state', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const settings = await AutomationSettings.findOne({ accountId }).exec();
  return res.status(200).json({
    enabled: settings?.enabled || false,
  });
});

router.post('/state', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const enabled = !!req.body?.enabled;
  await AutomationSettings.findOneAndUpdate(
    { accountId },
    { enabled, lastScanAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return res.status(204).end();
});

export default router;

