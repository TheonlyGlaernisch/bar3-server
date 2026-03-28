import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth'; // ✅ Middleware to set req.pwAccount
import { AutomationSettings } from '../../../interfaces/schemas/AutomationSettingsSchema'; // <--- Use the correct model
// import AutomationState from '../../../models/AutomationState'; // (Not used here, fine to remove if not needed)

const router = express.Router();
router.use(express.json());

// GET automation state
router.get('/state', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const settings = await AutomationSettings.findOne({ accountId }).exec();
  return res.status(200).json({
    enabled: settings?.enabled || false,
  });
});

// POST automation state
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
