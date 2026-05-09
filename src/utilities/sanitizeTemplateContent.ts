import { parse, HTMLElement } from 'node-html-parser';

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'meta',
  'base',
  'link',
  'form',
  'input',
  'button',
  'textarea',
  'select',
]);
const EVENT_HANDLER_ATTR = /^on/i;
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'srcdoc', 'action', 'formaction']);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[a-z0-9+/=]+$/i;

function sanitizeUrlLike(attributeName: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && !/\s/.test(char);
    })
    .join('')
    .toLowerCase();

  const isUnsafeProtocol = normalized.startsWith('javascript:')
    || normalized.startsWith('vbscript:')
    || normalized.startsWith('data:text/html');
  if (isUnsafeProtocol) return '';

  const isDataUrl = normalized.startsWith('data:');
  if (isDataUrl) {
    const isSafeImageData = (attributeName === 'src' || attributeName === 'xlink:href') && SAFE_DATA_IMAGE.test(normalized);
    return isSafeImageData ? trimmed : '';
  }

  return trimmed;
}

function sanitizeInlineStyle(value: string): string {
  return value
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*\)/gi, '')
    .replace(/behavior\s*:[^;]+;?/gi, '')
    .replace(/-moz-binding\s*:[^;]+;?/gi, '')
    .trim();
}

function sanitizeNodeAttributes(node: HTMLElement): void {
  const attrs = node.attributes || {};
  for (const [key, value] of Object.entries(attrs)) {
    if (EVENT_HANDLER_ATTR.test(key)) {
      node.removeAttribute(key);
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey === 'style') {
      const cleanedStyle = sanitizeInlineStyle(value);
      if (!cleanedStyle) {
        node.removeAttribute(key);
      } else if (cleanedStyle !== value) {
        node.setAttribute(key, cleanedStyle);
      }
      continue;
    }

    if (URL_ATTRIBUTES.has(lowerKey)) {
      const safe = sanitizeUrlLike(lowerKey, value);
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
