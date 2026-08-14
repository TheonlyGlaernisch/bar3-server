/**
 * Minimal, purpose-built Markdown -> HTML renderer.
 *
 * This is intentionally NOT a general-purpose Markdown library — it supports
 * only the subset of syntax used by PRIVACY.md (headings, bold, inline code,
 * links, blockquotes, horizontal rules, unordered lists, and pipe tables) so
 * the server doesn't need a new dependency just to render one legal page.
 *
 * All raw text is HTML-escaped before any markup is applied, so untrusted
 * content cannot inject HTML/script — safe even though this content is
 * currently fully first-party (the source file lives in the repo).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Applies inline markdown (bold, inline code, links) to already-escaped text. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderTable(lines: string[]): string {
  // First line = header, second line = separator (---|---|---), rest = body rows.
  const parseRow = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const headerCells = parseRow(lines[0]);
  const bodyLines = lines.slice(2);

  const headerHtml = headerCells.map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`).join('');
  const bodyHtml = bodyLines
    .map((line) => {
      const cells = parseRow(line);
      return `<tr>${cells.map((cell) => `<td>${renderInline(escapeHtml(cell))}</td>`).join('')}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];

  let i = 0;
  let inList = false;
  let inBlockquote = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html.push(`<p>${renderInline(escapeHtml(paragraphBuffer.join(' ')))}</p>`);
      paragraphBuffer = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };
  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>');
      inBlockquote = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Pipe table: a line starting with '|' followed by a separator line.
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const tableLines: string[] = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && /^\s*\|/.test(lines[j])) {
        tableLines.push(lines[j]);
        j += 1;
      }
      html.push(renderTable(tableLines));
      i = j;
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      flushParagraph();
      closeList();
      closeBlockquote();
      html.push('<hr />');
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(headingMatch[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      if (!inBlockquote) {
        flushParagraph();
        closeList();
        html.push('<blockquote>');
        inBlockquote = true;
      }
      const content = line.replace(/^>\s?/, '');
      if (content.trim() === '') {
        html.push('<br />');
      } else {
        html.push(`<p>${renderInline(escapeHtml(content))}</p>`);
      }
      i += 1;
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      closeBlockquote();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(listMatch[1]))}</li>`);
      i += 1;
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      closeBlockquote();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(orderedMatch[1]))}</li>`);
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      closeBlockquote();
      i += 1;
      continue;
    }

    // Plain text line: part of the current paragraph. Close any open list/
    // blockquote first (a plain line ends those blocks), then buffer it so
    // consecutive soft-wrapped lines join into a single <p> rather than one
    // <p> per source line.
    closeList();
    closeBlockquote();
    paragraphBuffer.push(line.trim());
    i += 1;
  }

  flushParagraph();
  closeList();
  closeBlockquote();

  return html.join('\n');
}
