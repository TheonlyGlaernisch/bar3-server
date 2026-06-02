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

  // Remove @import rules to prevent loading active content (linear scan).
  let withoutImports = '';
  const lower = css.toLowerCase();
  for (let i = 0; i < css.length; i += 1) {
    if (lower.startsWith('@import', i)) {
      let j = i + 7;
      while (j < css.length && css[j] !== ';') j += 1;
      i = j;
      continue;
    }
    withoutImports += css[i];
  }

  const toLowerNoSpaceControl = (value: string): string => {
    let out = '';
    for (const char of value) {
      const code = char.charCodeAt(0);
      if (code <= 31 || code === 127 || /\s/.test(char)) continue;
      out += char.toLowerCase();
    }
    return out;
  };

  const trimMatchingQuotes = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return trimmed;
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  };

  let sanitized = '';
  const lowerCss = withoutImports.toLowerCase();
  for (let i = 0; i < withoutImports.length; i += 1) {
    if (lowerCss.startsWith('expression(', i)) {
      let j = i + 'expression('.length;
      let depth = 1;
      while (j < withoutImports.length && depth > 0) {
        const ch = withoutImports[j];
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        j += 1;
      }
      i = j - 1;
      continue;
    }

    if (lowerCss.startsWith('url(', i)) {
      let j = i + 'url('.length;
      let depth = 1;
      while (j < withoutImports.length && depth > 0) {
        const ch = withoutImports[j];
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        j += 1;
      }
      const end = j;
      const rawInside = withoutImports.slice(i + 'url('.length, Math.max(i + 'url('.length, end - 1));
      const normalizedInside = toLowerNoSpaceControl(trimMatchingQuotes(rawInside));
      const hasUnsafeScheme = normalizedInside.startsWith('javascript:')
        || normalizedInside.startsWith('vbscript:')
        || normalizedInside.startsWith('data:');
      if (hasUnsafeScheme) {
        sanitized += 'url()';
      } else {
        sanitized += withoutImports.slice(i, end);
      }
      i = end - 1;
      continue;
    }

    sanitized += withoutImports[i];
  }

  const safeDeclarations: string[] = [];
  for (const declaration of sanitized.split(';')) {
    const raw = declaration.trim();
    if (!raw) continue;
    const lowerDecl = raw.toLowerCase();
    if (lowerDecl.startsWith('behavior:') || lowerDecl.startsWith('-moz-binding:')) {
      continue;
    }
    safeDeclarations.push(raw);
  }

  return safeDeclarations.join('; ');
}
