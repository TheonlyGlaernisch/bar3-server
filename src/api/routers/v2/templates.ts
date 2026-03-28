import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth';
import { MessageTemplate } from '../../../interfaces/schemas/MessageTemplateSchema';

const router = express.Router();
router.use(express.json());

router.get('/', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const templates = await MessageTemplate.find({ accountId }).sort({ updatedAt: -1 }).exec();
  return res.status(200).json(
    templates.map(t => ({
      id: t._id.toString(),
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  );
});

router.post('/', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const subject = typeof req.body?.subject === 'string' ? req.body.subject : '';
  const bodyText = typeof req.body?.bodyText === 'string' ? req.body.bodyText : undefined;
  const bodyHtml = typeof req.body?.bodyHtml === 'string' ? req.body.bodyHtml : undefined;

  if (!subject.trim()) return res.status(400).json({ error: 'subject required' });
  if (!bodyText?.trim() && !bodyHtml?.trim()) return res.status(400).json({ error: 'bodyText or bodyHtml required' });

  // Try to find the latest (by updatedAt) and update it, else create new
  let template = await MessageTemplate.findOneAndUpdate(
    { accountId },
    {
      subject: subject.trim(),
      bodyText: bodyText?.toString(),
      bodyHtml: bodyHtml?.toString(),
      updatedAt: new Date(),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();

  return res.status(200).json({
    id: template._id.toString(),
    subject: template.subject,
    bodyText: template.bodyText,
    bodyHtml: template.bodyHtml,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });
});


router.put('/:id', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const id = req.params.id;
  const subject = typeof req.body?.subject === 'string' ? req.body.subject : '';
  const bodyText = typeof req.body?.bodyText === 'string' ? req.body.bodyText : undefined;
  const bodyHtml = typeof req.body?.bodyHtml === 'string' ? req.body.bodyHtml : undefined;

  const updated = await MessageTemplate.findOneAndUpdate(
    { _id: id, accountId },
    { subject: subject.trim(), bodyText, bodyHtml, updatedAt: new Date() },
    { new: true }
  ).exec();

  if (!updated) return res.status(404).json({ error: 'not found' });

  return res.status(200).json({
    id: updated._id.toString(),
    subject: updated.subject,
    bodyText: updated.bodyText,
    bodyHtml: updated.bodyHtml,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

export default router;

