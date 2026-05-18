import crypto from 'crypto';
import { parse } from 'node-html-parser';
import { ITrackingLink, MessageView, TrackingLink } from '../interfaces/schemas/AnalyticsSchemas';

function makeId(bytes = 8): string {
  // Hex is URL-safe and supported in older Node typings.
  return crypto.randomBytes(bytes).toString('hex');
}

function normalizeTrackedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function getOrCreateTrackingLink(accountId: string, url: string): Promise<string> {
  const normalizedUrl = normalizeTrackedUrl(url);
  if (!normalizedUrl) return '';
  // Reuse per-account+url
  const existing = await TrackingLink.findOne({ accountId, url: normalizedUrl }).exec();
  if (existing) return existing.shortId;

  const shortId = makeId(9);
  await TrackingLink.create({ accountId, shortId, url: normalizedUrl });
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

function buildPixelTag(baseUrl: string, accountId: string, messageId: string): string {
  const pixelUrl = `${baseUrl}/analytics/v2/p/${encodeURIComponent(messageId)}?a=${encodeURIComponent(accountId)}`;
  return `<img src="${pixelUrl}" alt="" width="1" height="1" aria-hidden="true" style="position:absolute;left:0;top:0;width:1px;height:1px;border:0;" />`;
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
        if (!shortId) continue;
        link.setAttribute('href', `${baseUrl}/analytics/v2/l/${shortId}`);
      }
    }

    // Always include view pixel if analytics on.
    const out = parsed.toString() + buildPixelTag(baseUrl, accountId, messageId);
    return out;
  };

  // If link tracking off, we can do sync injection for pixel only.
  if (!trackLinks) {
    return parsed.toString() + buildPixelTag(baseUrl, accountId, messageId);
  }

  return work();
}
