import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderMarkdown } from '../../utilities/simpleMarkdown';

const router = express.Router();

const privacyPageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// PRIVACY.md lives at the repo root; this file is compiled to dist/api/routers,
// so walk back up to the repo root at request time (cheap — this route is rate
// limited, and the file is tiny).
const PRIVACY_MD_PATH = join(__dirname, '..', '..', '..', 'PRIVACY.md');

function buildPrivacyHtml(): string {
  let bodyHtml: string;
  try {
    const markdown = readFileSync(PRIVACY_MD_PATH, 'utf8');
    bodyHtml = renderMarkdown(markdown);
  } catch (err) {
    console.error('[Privacy] Failed to read/render PRIVACY.md:', err);
    bodyHtml = '<p>The privacy policy is temporarily unavailable. Please try again shortly.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bar3 — Privacy Policy</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
    }
    .wrap {
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }
    .back {
      display: inline-block;
      margin-bottom: 24px;
      color: #9aa3e0;
      text-decoration: none;
      font-size: 0.9rem;
    }
    .back:hover { text-decoration: underline; }
    .card {
      background: #16213e;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      padding: 32px 36px;
      box-shadow: 0 10px 34px rgba(0,0,0,0.35);
    }
    h1 { color: #fff; font-size: 1.7rem; margin: 0 0 8px; }
    h2 { color: #fff; font-size: 1.25rem; margin: 28px 0 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px; }
    h2:first-of-type { border-top: none; padding-top: 0; }
    h3 { color: #dbe1ff; font-size: 1.05rem; margin: 18px 0 6px; }
    p { color: #cfd3ea; margin: 0 0 12px; }
    strong { color: #fff; }
    a { color: #7c8cff; }
    hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
    ul { color: #cfd3ea; padding-left: 22px; margin: 0 0 14px; }
    li { margin-bottom: 6px; }
    blockquote {
      margin: 0 0 16px;
      padding: 12px 16px;
      border-left: 3px solid #5865F2;
      background: rgba(88,101,242,0.08);
      border-radius: 4px;
    }
    blockquote p { margin: 0; color: #dbe1ff; font-size: 0.92rem; }
    code {
      background: rgba(255,255,255,0.08);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 18px;
      font-size: 0.88rem;
    }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      vertical-align: top;
    }
    th { color: #dbe1ff; font-weight: 600; background: rgba(255,255,255,0.03); }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="javascript:history.length > 1 ? history.back() : (location.href = '/')">&larr; Back</a>
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

router.get('/', privacyPageLimiter, (_req: Request, res: Response) => {
  res.status(200).type('html').send(buildPrivacyHtml());
});

export default router;
