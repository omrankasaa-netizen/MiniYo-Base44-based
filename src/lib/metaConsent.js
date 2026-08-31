// Pure (DOM-free) parsing of the stored cookie-consent value.
//
// The cookie banner has historically stored the string 'granted' / 'denied'
// under the localStorage key 'miniyo-consent'. This module understands that
// legacy shape AND a forward-compatible JSON object (e.g. {"marketing":true})
// so marketing gating can be reasoned about without a browser. Keeping it free
// of React / window imports lets it be unit-tested directly under node:test.

export const CONSENT_KEY = 'miniyo-consent';

// Normalize whatever is stored into an object, or null when no valid choice
// has been recorded yet. `marketing` is left as `true` / `false` / `undefined`
// (NOT coerced to a boolean) so callers can distinguish an explicit decline
// from a JSON object that simply doesn't mention `marketing` yet — under the
// implied-consent model, only an explicit `false` should block tracking.
export function parseStoredConsent(raw) {
  if (raw == null || raw === '') return null;
  if (raw === 'granted') return { marketing: true };
  if (raw === 'denied') return { marketing: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...parsed };
    }
  } catch {
    // Not JSON and not a known literal → treat as no valid choice.
  }
  return null;
}

// IMPLIED consent model: tracking is allowed by default (no choice yet counts
// as consent) and only an EXPLICIT decline blocks it. Lebanon/MENA e-commerce
// is not under GDPR's strict prior-opt-in requirement, and gating every event
// (including the very first PageView) behind a clicked "Accept" was silently
// dropping most real traffic from Meta/TikTok — visitors who bounced, ignored
// the banner, or never interacted with it were invisible to those platforms
// even though GA4 (which has no such gate) counted them normally. This is the
// only place that decision is made, so both metaPixel and tiktokPixel inherit
// it automatically via hasMarketingConsent()/hasMarketingConsentValue().
export function hasMarketingConsentValue(raw) {
  const consent = parseStoredConsent(raw);
  if (!consent) return true; // no stored choice yet -> implied consent
  return consent.marketing !== false; // only an explicit decline blocks tracking
}
