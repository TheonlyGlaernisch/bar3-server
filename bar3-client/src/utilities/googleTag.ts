const GOOGLE_TAG_ID = 'G-P4D00LBHYL';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function ensureGoogleTag(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!document.getElementById('bar3-google-tag-script')) {
    const script = document.createElement('script');
    script.id = 'bar3-google-tag-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;
    document.head.appendChild(script);
  }

  const existing = window.dataLayer;
  window.dataLayer = Array.isArray(existing) ? existing : [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };
  }

  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_TAG_ID);
}
