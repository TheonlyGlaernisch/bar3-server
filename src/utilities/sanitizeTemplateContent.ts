import { parse, HTMLElement } from 'node-html-parser';

const FORBIDDEN_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta']);
const EVENT_HANDLER_ATTR = /^on/i;
const SAFE_URL_PROTOCOL = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;
const SAFE_DATA_IMAGE = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;

function sanitizeUrlLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (SAFE_URL_PROTOCOL.test(trimmed) || SAFE_DATA_IMAGE.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function sanitizeNodeAttributes(node: HTMLElement): void {
  const attrs = node.attributes || {};
  for (const [key, value] of Object.entries(attrs)) {
    if (EVENT_HANDLER_ATTR.test(key)) {
      node.removeAttribute(key);
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey === 'href' || lowerKey === 'src' || lowerKey === 'xlink:href') {
      const safe = sanitizeUrlLike(value);
      if (!safe) {
        node.removeAttribute(key);
      } else if (safe !== value) {
        node.setAttribute(key, safe);
      }
    }
  }
}

export function sanitizeTemplateHtml(input: string): string {
  if (!input) return '';
  const parsed = parse(input, { lowerCaseTagName: true, comment: false });
  const all = parsed.querySelectorAll('*');

  for (const node of all) {
    if (FORBIDDEN_TAGS.has(node.tagName.toLowerCase())) {
      node.remove();
      continue;
    }
    sanitizeNodeAttributes(node);
  }

  return parsed.toString();
}

export function sanitizeTemplateCss(input?: string): string {
  const css = (input || '').trim();
  if (!css) return '';

  return css
    // Remove @import rules to prevent loading active content.
    .replace(/@import[\s\S]*?;/gi, '')
    // Strip javascript: URLs and old IE expression() style execution.
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[\s\S]*?\1\s*\)/gi, 'url()')
    .replace(/expression\s*\([\s\S]*?\)/gi, '');
}
