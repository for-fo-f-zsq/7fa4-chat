export function getSiteBase() {
  if (typeof window === 'undefined') return './';
  try {
    if (import.meta.env.PROD) {
      const dir = new URL('.', import.meta.url).pathname;
      return dir.replace(/assets\/$/, '');
    }
  } catch {
    /* fallback */
  }
  const stripped = window.location.pathname
    .replace(/\/(?:feedback|admin)(?:\/.*)?$/, '')
    .replace(/\/+$/, '');
  return stripped ? `${stripped}/` : '/';
}

export const SITE_BASE = getSiteBase();

export function sitePath(rel = '') {
  const clean = String(rel || '').replace(/^\/+/, '');
  return `${SITE_BASE}${clean}`;
}
