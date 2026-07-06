// Pure (DOM-free) parsing of the stored cookie-consent value.
//
// The cookie banner has historically stored the string 'granted' / 'denied'
// under the localStorage key 'miniyo-consent'. This module understands that
// legacy shape AND a forward-compatible JSON object (e.g. {"marketing":true})
// so marketing gating can be reasoned about without a browser. Keeping it free
// of React / window imports lets it be unit-tested directly under node:test.

export const CONSENT_KEY = 'miniyo-consent';

// Normalize whatever is stored into an object with a boolean `marketing` field,
// or null when no valid choice has been recorded yet.
export function parseStoredConsent(raw) {
  if (raw == null || raw === '') return null;
  if (raw === 'granted') return { marketing: true };
  if (raw === 'denied') return { marketing: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...parsed, marketing: parsed.marketing === true };
    }
  } catch {
    // Not JSON and not a known literal → treat as no valid choice.
  }
  return null;
}

// True only when the visitor has explicitly granted marketing consent.
export function hasMarketingConsentValue(raw) {
  const consent = parseStoredConsent(raw);
  return !!consent && consent.marketing === true;
}
