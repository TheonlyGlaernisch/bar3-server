import constitutionMarkdown from '!!raw-loader!@/content/constitution.md';
import { API_BASE_URL } from '@/utilities/serverUrls';

const CONSTITUTION_GOOGLE_DOC_URL = (process.env.VUE_APP_CONSTITUTION_GOOGLE_DOC_URL || '').trim();

export function extractGoogleDocId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const documentPathMatch = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (documentPathMatch?.[1]) return documentPathMatch[1];

  try {
    const url = new URL(trimmed);
    return url.searchParams.get('id') || undefined;
  } catch {
    return undefined;
  }
}

async function fetchGoogleDocMarkdown(docId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/constitution/google-doc/${encodeURIComponent(docId)}`, {
    headers: {
      Accept: 'text/markdown',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch constitution Google Doc: ${response.status}`);
  }

  return response.text();
}

/**
 * Single source loader for the constitution document.
 *
 * If VUE_APP_CONSTITUTION_GOOGLE_DOC_URL is set, this extracts the Google Doc ID,
 * asks the server to fetch/export the document, and returns the converted
 * markdown. If the URL is absent or the fetch fails, the local markdown file
 * remains the safe fallback source.
 */
export async function getConstitutionMarkdown(): Promise<string> {
  const googleDocId = extractGoogleDocId(CONSTITUTION_GOOGLE_DOC_URL);
  if (!googleDocId) return constitutionMarkdown;

  try {
    const markdown = await fetchGoogleDocMarkdown(googleDocId);
    return markdown.trim() || constitutionMarkdown;
  } catch {
    return constitutionMarkdown;
  }
}
