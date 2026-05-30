import MarkdownIt from 'markdown-it';

export type ConstitutionBlock =
  | { type: 'html'; html: string }
  | { type: 'law'; severity: string; html: string }
  | { type: 'lore'; html: string }
  | { type: 'amendment'; version: string; html: string };

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export interface RenderedConstitution {
  blocks: ConstitutionBlock[];
  toc: TocItem[];
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim();
}

export function slugifyHeading(value: string, counts: Map<string, number>): string {
  const base = stripInlineMarkdown(value)
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function generateToc(markdown: string): TocItem[] {
  const counts = new Map<string, number>();
  const toc: TocItem[] = [];
  let containerDepth = 0;

  markdown.split(/\r?\n/).forEach((line) => {
    if (/^:::\s*(law|lore|amendment)\b/.test(line.trim())) {
      containerDepth += 1;
      return;
    }

    if (containerDepth > 0 && line.trim() === ':::') {
      containerDepth -= 1;
      return;
    }

    if (containerDepth > 0) return;

    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;

    const title = stripInlineMarkdown(match[2]);
    toc.push({
      id: slugifyHeading(title, counts),
      title,
      level: match[1].length,
    });
  });

  return toc;
}

function parseAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  value.replace(/([a-zA-Z0-9_-]+)=['"]([^'"]*)['"]/g, (_, key: string, attrValue: string) => {
    attrs[key] = attrValue;
    return '';
  });
  return attrs;
}

function createMarkdownRenderer(toc: TocItem[]) {
  let headingIndex = 0;
  const renderer = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });

  renderer.renderer.rules.heading_open = (tokens: any[], idx: number) => {
    const item = toc[headingIndex];
    const id = item?.id ?? `section-${headingIndex + 1}`;
    headingIndex += 1;
    const level = tokens[idx].tag;
    const articleClass = level === 'h1' && item?.title.toLowerCase().startsWith('article')
      ? ' constitution-heading--article'
      : '';
    return `<${level} id="${id}" class="constitution-heading${articleClass} scroll-mt-28"><a class="constitution-anchor" href="#${id}" aria-label="Link to ${item?.title ?? 'section'}">#</a>`;
  };

  return renderer;
}

function renderMarkdown(markdown: string, renderer: MarkdownIt): string {
  return renderer.render(markdown.trim());
}

export function renderConstitutionMarkdown(markdown: string): RenderedConstitution {
  const toc = generateToc(markdown);
  const renderer = createMarkdownRenderer(toc);
  const blocks: ConstitutionBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  const buffer: string[] = [];

  const flushMarkdown = () => {
    const markdownChunk = buffer.join('\n').trim();
    if (markdownChunk) {
      blocks.push({ type: 'html', html: renderMarkdown(markdownChunk, renderer) });
    }
    buffer.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const opening = /^:::\s*(law|lore|amendment)\b(.*)$/.exec(lines[i].trim());

    if (!opening) {
      buffer.push(lines[i]);
      continue;
    }

    flushMarkdown();
    const [, containerType, rawAttrs] = opening;
    const containerLines: string[] = [];
    i += 1;
    while (i < lines.length && lines[i].trim() !== ':::') {
      containerLines.push(lines[i]);
      i += 1;
    }

    const html = renderMarkdown(containerLines.join('\n'), renderer);
    const attrs = parseAttributes(rawAttrs);

    if (containerType === 'law') {
      blocks.push({ type: 'law', severity: attrs.severity ?? 'standard', html });
    } else if (containerType === 'amendment') {
      blocks.push({ type: 'amendment', version: attrs.version ?? 'draft', html });
    } else {
      blocks.push({ type: 'lore', html });
    }
  }

  flushMarkdown();
  return { blocks, toc };
}
