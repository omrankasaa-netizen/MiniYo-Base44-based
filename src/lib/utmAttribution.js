import { safeLocalStorage } from './safeStorage.js';

export const UTM_STORAGE_KEY = 'miniyo-utm-attribution-v1';
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export function normalizeUtmValue(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

export function normalizeUtmPayload(payload = {}) {
  const normalized = {};
  for (const key of UTM_KEYS) {
    const val = normalizeUtmValue(payload[key]);
    if (val) normalized[key] = val;
  }
  return normalized;
}

export function getUtmFromSearch(search = '') {
  if (typeof search !== 'string' || !search.trim()) return {};
  const params = new URLSearchParams(search);
  const out = {};
  for (const key of UTM_KEYS) {
    const val = normalizeUtmValue(params.get(key));
    if (val) out[key] = val;
  }
  return out;
}

export function readStoredUtmAttribution() {
  try {
    const raw = safeLocalStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const utm = normalizeUtmPayload(parsed);
    if (!Object.keys(utm).length) return null;
    return {
      ...utm,
      ...(parsed.landing_path ? { landing_path: String(parsed.landing_path) } : {}),
      ...(parsed.landing_url ? { landing_url: String(parsed.landing_url) } : {}),
      ...(parsed.captured_at ? { captured_at: String(parsed.captured_at) } : {}),
    };
  } catch {
    return null;
  }
}

export function captureUtmAttribution(search, pathname = '') {
  if (typeof window === 'undefined') return null;
  const utm = getUtmFromSearch(search);
  if (!Object.keys(utm).length) return null;

  const payload = {
    ...utm,
    landing_path: String(pathname || window.location.pathname || ''),
    landing_url: window.location.href,
    captured_at: new Date().toISOString(),
  };
  safeLocalStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}
