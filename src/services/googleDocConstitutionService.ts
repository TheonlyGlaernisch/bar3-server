import superagent from 'superagent';
import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';

const GOOGLE_DOC_EXPORT_TIMEOUT_MS = 15000;
const GOOGLE_DOC_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;
const BLOCK_TAGS = new Set(['body', 'main', 'article', 'section', 'div']);
const SKIPPED_TAGS = new Set(['script', 'style', 'meta', 'link', 'noscript', 'svg']);

export function isGoogleDocId(value: string): boolean {
  return GOOGLE_DOC_ID_PATTERN.test(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeHref(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || /^(javascript|vbscript|data):/i.test(trimmed)) return '';
  return trimmed;
}

function renderInline(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return normalizeWhitespace(node.rawText || node.text || '');
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (SKIPPED_TAGS.has(tagName)) return '';
  if (tagName === 'br') return '\n';

  const content = element.childNodes.map(renderInline).filter(Boolean).join(' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!content) return '';

  if (tagName === 'strong' || tagName === 'b') return `**${content}**`;
  if (tagName === 'em' || tagName === 'i') return `_${content}_`;
  if (tagName === 'code') return `\`${content.replace(/`/g, '\\`')}\``;
  if (tagName === 'a') {
    const href = safeHref(element.getAttribute('href'));
    return href ? `[${content}](${href})` : content;
  }

  return content;
}

function renderList(element: HTMLElement, ordered: boolean): string {
  let index = 1;
  return element.childNodes
    .filter((node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'li')
    .map((li) => {
      const prefix = ordered ? `${index++}.` : '-';
      const directText = li.childNodes
        .filter((child) => !(child.nodeType === NodeType.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase())))
        .map(renderInline)
        .filter(Boolean)
        .join(' ')
        .trim();
      const nested = li.childNodes
        .filter((child) => child.nodeType === NodeType.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase()))
        .map((child) => renderBlock(child).split('\n').map((line) => `  ${line}`).join('\n'))
        .filter(Boolean)
        .join('\n');
      return nested ? `${prefix} ${directText}\n${nested}` : `${prefix} ${directText}`;
    })
    .filter((line) => line.trim().length > 2)
    .join('\n');
}

function renderTable(element: HTMLElement): string {
  const rows = element.querySelectorAll('tr')
    .map((row) => row.querySelectorAll('th,td').map((cell) => renderInline(cell)).filter(Boolean));
  if (rows.length === 0) return '';

  const header = rows[0];
  const separator = header.map(() => '---');
  const body = rows.slice(1);
  return [header, separator, ...body]
    .filter((row) => row.length > 0)
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function renderBlock(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return normalizeWhitespace(node.rawText || node.text || '');
  if (node.nodeType !== NodeType.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tagName)) return '';

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    const text = renderInline(element);
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  if (tagName === 'p') return renderInline(element);
  if (tagName === 'ul') return renderList(element, false);
  if (tagName === 'ol') return renderList(element, true);
  if (tagName === 'blockquote') {
    return renderInline(element).split('\n').map((line) => `> ${line}`).join('\n');
  }
  if (tagName === 'hr') return '---';
  if (tagName === 'table') return renderTable(element);
  if (tagName === 'br') return '';

  if (BLOCK_TAGS.has(tagName)) {
    return element.childNodes.map(renderBlock).filter(Boolean).join('\n\n');
  }

  return renderInline(element);
}

export function convertGoogleDocHtmlToMarkdown(html: string): string {
  const root = parse(html, { lowerCaseTagName: true, comment: false });
  const body = root.querySelector('body') || root;
  return normalizeMarkdown(body.childNodes.map(renderBlock).filter(Boolean).join('\n\n'));
}

export async function fetchGoogleDocMarkdown(docId: string): Promise<string> {
  if (!isGoogleDocId(docId)) {
    throw new Error('Invalid Google Doc ID');
  }

  const exportUrl = `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export`;
  const response = await superagent
    .get(exportUrl)
    .query({ format: 'html' })
    .set('Accept', 'text/html,application/xhtml+xml')
    .timeout({ response: GOOGLE_DOC_EXPORT_TIMEOUT_MS, deadline: GOOGLE_DOC_EXPORT_TIMEOUT_MS + 5000 });

  const markdown = convertGoogleDocHtmlToMarkdown(response.text || '');
  if (!markdown) {
    throw new Error('Google Doc export was empty');
  }

  return markdown;
}
