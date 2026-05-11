const BLOCKED_TAGS = new Set([
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

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'srcdoc', 'action', 'formaction']);
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[a-z0-9+/=]+$/i;

function isUnsafeUrl(attributeName: string, value: string): boolean {
  const normalized = value
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && !/\s/.test(char);
    })
    .join('')
    .toLowerCase();
  return normalized.startsWith('javascript:')
    || normalized.startsWith('vbscript:')
    || normalized.startsWith('data:text/html')
    || (normalized.startsWith('data:') && !(
      (attributeName === 'src' || attributeName === 'xlink:href') && SAFE_DATA_IMAGE_RE.test(normalized)
    ));
}

function sanitizeStyle(value: string): string {
  return value
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*\)/gi, '')
    .replace(/behavior\s*:[^;]+;?/gi, '')
    .replace(/-moz-binding\s*:[^;]+;?/gi, '')
    .trim();
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';

  const template = document.createElement('template');
  template.innerHTML = input;
  const elements = Array.from(template.content.querySelectorAll('*'));

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === 'style') {
        const cleanedStyle = sanitizeStyle(value);
        if (cleanedStyle) {
          element.setAttribute('style', cleanedStyle);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }

      if (URL_ATTRIBUTES.has(name) && isUnsafeUrl(name, value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return template.innerHTML;
}
