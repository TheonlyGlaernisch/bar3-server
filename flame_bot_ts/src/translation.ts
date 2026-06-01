const GOOGLE_TRANSLATE_BASE_URL = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATE_TIMEOUT_MS = 10_000;

export type SupportedTranslationLanguage = 'en' | 'hr';

export interface TranslationResult {
  sourceLanguage: SupportedTranslationLanguage;
  targetLanguage: SupportedTranslationLanguage;
  text: string;
}

function normalizeLanguageCode(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split('-')[0] || '';
}

async function requestTranslation(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<{ translatedText: string; detectedLanguage: string | null } | null> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage,
    tl: targetLanguage,
    dt: 't',
    q: text,
  });
  const response = await fetch(`${GOOGLE_TRANSLATE_BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const payloadList = Array.isArray(payload) ? payload : [];
  const chunks = Array.isArray(payloadList[0]) ? payloadList[0] : [];
  const translatedText = chunks
    .map((chunk: unknown) => {
      if (!Array.isArray(chunk)) return '';
      return String(chunk[0] ?? '');
    })
    .join('')
    .trim();
  const detectedLanguage = normalizeLanguageCode(payloadList[2] ?? '');
  return {
    translatedText,
    detectedLanguage: detectedLanguage || null,
  };
}

export async function translateBetweenEnglishAndCroatian(text: string): Promise<TranslationResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const toEnglish = await requestTranslation(trimmed, 'auto', 'en');
  if (!toEnglish || !toEnglish.detectedLanguage) return null;
  if (toEnglish.detectedLanguage === 'hr' && toEnglish.translatedText) {
    return {
      sourceLanguage: 'hr',
      targetLanguage: 'en',
      text: toEnglish.translatedText,
    };
  }
  if (toEnglish.detectedLanguage !== 'en') return null;
  const toCroatian = await requestTranslation(trimmed, 'en', 'hr');
  if (!toCroatian || !toCroatian.translatedText) return null;
  return {
    sourceLanguage: 'en',
    targetLanguage: 'hr',
    text: toCroatian.translatedText,
  };
}
