import juice from 'juice';

/**
 * Combines raw HTML and CSS into a single HTML string by inlining the CSS
 * as `style` attributes on each element (using juice).
 *
 * @param html - The raw HTML string
 * @param css  - The raw CSS string (may be empty / undefined)
 * @returns    The combined HTML string ready to be sent via the P&W API
 */
export function combineHtmlAndCss(html: string, css?: string): string {
  const trimmedCss = (css || '').trim();
  if (!trimmedCss) return html;
  return juice(`<style>${trimmedCss}</style>${html}`);
}
