import crypto from 'crypto';
import { parse } from 'node-html-parser';
import { ITrackingLink, MessageView, TrackingLink } from '../interfaces/schemas/AnalyticsSchemas';

function makeId(bytes = 8): string {
  // Hex is URL-safe and supported in older Node typings.
  return crypto.randomBytes(bytes).toString('hex');
}

export async function getOrCreateTrackingLink(accountId: string, url: string): Promise<string> {
  // Reuse per-account+url
  const existing = await TrackingLink.findOne({ accountId, url }).exec();
  if (existing) return existing.shortId;

  const shortId = makeId(9);
  await TrackingLink.create({ accountId, shortId, url });
  return shortId;
}

export async function recordClick(shortId: string): Promise<ITrackingLink | null> {
  return TrackingLink.findOneAndUpdate(
    { shortId },
    { $inc: { clickCount: 1 }, $push: { clickHistory: new Date() } },
    { new: true }
  ).exec();
}

export async function getOrCreateMessageView(accountId: string, messageId: string) {
  const existing = await MessageView.findOne({ accountId, messageId }).exec();
  if (existing) return existing;
  return MessageView.create({ accountId, messageId });
}

export async function recordView(accountId: string, messageId: string) {
  return MessageView.findOneAndUpdate(
    { accountId, messageId },
    { $inc: { viewCount: 1 }, $push: { viewHistory: new Date() } },
    { new: true, upsert: true }
  ).exec();
}

export function injectTrackingIntoHtml(opts: {
  baseUrl: string;
  accountId: string;
  messageId: string;
  html: string;
  trackLinks: boolean;
}): Promise<string> | string {
  const { baseUrl, accountId, messageId, html, trackLinks } = opts;
  const parsed = parse(html || '');

  const work = async () => {
    if (trackLinks) {
      const links = parsed.querySelectorAll('a');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const shortId = await getOrCreateTrackingLink(accountId, href);
        link.setAttribute('href', `${baseUrl}/analytics/v2/l/${shortId}`);
      }
    }

    // Always include view pixel if analytics on.
    const pixelUrl = `${baseUrl}/analytics/v2/p/${encodeURIComponent(messageId)}?a=${encodeURIComponent(accountId)}`;
    const out = parsed.toString() + `<img src="${pixelUrl}" alt="" style="display:none" />`;
    return out;
  };

  // If link tracking off, we can do sync injection for pixel only.
  if (!trackLinks) {
    const pixelUrl = `${baseUrl}/analytics/v2/p/${encodeURIComponent(messageId)}?a=${encodeURIComponent(accountId)}`;
    return parsed.toString() + `<img src="${pixelUrl}" alt="" style="display:none" />`;
  }

  return work();
}

