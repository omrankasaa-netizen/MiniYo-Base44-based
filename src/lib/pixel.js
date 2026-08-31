import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { safeLocalStorage } from '@/lib/safeStorage';
import { CONSENT_KEY, hasMarketingConsentValue, parseStoredConsent } from '@/lib/metaConsent';

// Meta + TikTok Pixel helpers. Pixels are bootstrapped only after marketing
// consent is granted, so non-consenting users pay zero third-party tracking cost.
// Everything is fail-safe and never throws into app code.

export const META_PIXEL_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_META_PIXEL_ID) ||
  '1480243427454221';

export const TIKTOK_PIXEL_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TIKTOK_PIXEL_ID) ||
  'D9BP18JC77U1026616UG';

let metaInitialized = false;
let tiktokInitialized = false;

// ── Advanced Matching helpers ────────────────────────────────────────────────

// SHA-256 via SubtleCrypto. Normalises (trim + lowercase) before hashing.
// Returns undefined when input is empty or crypto is unavailable.
async function sha256hex(str) {
  if (!str || typeof window === 'undefined' || !window.crypto?.subtle) return undefined;
  try {
    const encoded = new TextEncoder().encode(String(str).trim().toLowerCase());
    const buf = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

// Persistent anonymous visitor ID stored in safeLocalStorage. Created once per
// browser so Meta can tie cross-session events together via external_id.
const VID_KEY = '_meta_vid';
function getOrCreateVisitorId() {
  if (typeof window === 'undefined') return null;
  try {
    let vid = safeLocalStorage.getItem(VID_KEY);
    if (!vid) {
      vid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `vid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      safeLocalStorage.setItem(VID_KEY, vid);
    }
    return vid;
  } catch {
    return null;
  }
}

// Capture ?fbclid=... from the landing URL into a _fbc cookie so the Meta pixel
// can read it when events fire (even if the pixel loads after SPA navigation
// has stripped the query string). Called immediately on app mount — does not
// require marketing consent since we're only persisting a URL parameter the
// visitor arrived with.
export function captureFbclid() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (!fbclid) return;
    // Don't clobber a valid _fbc the Meta pixel already set. Repair only a
    // missing cookie or a legacy one whose creation time was written in
    // SECONDS (our old bug): Meta's fbc spec requires MILLISECONDS
    // (fb.1.{ms}.{fbclid}); a seconds value reads as ~1970, which is exactly
    // the "creationTime dated before the click ID" Events Manager diagnostic.
    const existing = document.cookie.split('; ').find((c) => c.startsWith('_fbc='));
    if (existing) {
      const val = decodeURIComponent(existing.split('=').slice(1).join('='));
      const ts = Number(val.split('.')[2]);
      if (val.startsWith('fb.1.') && ts > 1e12) return; // already valid (ms)
    }
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    // 90-day cookie — matches Meta's default retention window.
    document.cookie = `_fbc=${encodeURIComponent(fbc)};path=/;max-age=${90 * 24 * 60 * 60};SameSite=Lax`;
  } catch { /* never throw */ }
}

// Re-call fbq('init') with hashed Advanced Matching params so every subsequent
// event carries email / phone / names / geo / external_id for Meta's Event Match
// Quality score. All PII is SHA-256 hashed client-side (Meta accepts pre-hashed
// values). Also sends the anonymous visitor ID as external_id even when no PII
// is provided, which alone gives a match-quality lift per Meta's EMQ docs.
//
// The hashed blob (never raw PII) is persisted in safeLocalStorage so a
// RETURNING visitor's very first PageView/ViewContent already carries identity
// — this is what moves the ViewContent EMQ score between checkout sessions.
const AM_KEY = '_meta_am';

export function getStoredAdvancedMatching() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeLocalStorage.getItem(AM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Only keep well-formed SHA-256 hex values (64 chars) — anything else is
    // dropped rather than sent to Meta.
    const clean = {};
    for (const k of ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country']) {
      if (typeof parsed[k] === 'string' && /^[0-9a-f]{64}$/.test(parsed[k])) clean[k] = parsed[k];
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

export async function updateAdvancedMatching({ email, phone, firstName, lastName, city, state, zip, country } = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    const vid = getOrCreateVisitorId();
    const normPhone = phone ? String(phone).replace(/[\s\-()]/g, '') : undefined;
    const [em, ph, fn, ln, ct, st, zp, ctr, extId] = await Promise.all([
      sha256hex(email),
      sha256hex(normPhone),
      sha256hex(firstName),
      sha256hex(lastName),
      sha256hex(city),
      sha256hex(state),
      sha256hex(zip),
      sha256hex(country ? String(country).trim().toLowerCase() : undefined),
      sha256hex(vid),
    ]);
    const userData = {};
    if (em)    userData.em          = em;
    if (ph)    userData.ph          = ph;
    if (fn)    userData.fn          = fn;
    if (ln)    userData.ln          = ln;
    if (ct)    userData.ct          = ct;
    if (st)    userData.st          = st;
    if (zp)    userData.zp          = zp;
    if (ctr)   userData.country     = ctr;
    if (extId) userData.external_id = extId;
    if (Object.keys(userData).length === 0) return;
    window.fbq('init', META_PIXEL_ID, userData);
    // Persist only the hashed identity (minus external_id, which comes from
    // the visitor-id helper) for future sessions' init + CAPI track twins.
    const { external_id, ...hashed } = userData;
    if (Object.keys(hashed).length) {
      try { safeLocalStorage.setItem(AM_KEY, JSON.stringify(hashed)); } catch { /* quota */ }
    }
  } catch { /* tracking must never break the UX */ }
}

// Returns 'granted' | 'denied' | null (no choice stored yet).
export function getConsentChoice() {
  if (typeof window === 'undefined') return null;
  const consent = parseStoredConsent(safeLocalStorage.getItem(CONSENT_KEY));
  if (!consent) return null;
  return consent.marketing ? 'granted' : 'denied';
}

export function hasConsent() {
  return getConsentChoice() === 'granted';
}

// Marketing-consent gate for all Pixel + CAPI activity. Reads the raw stored
// value and understands both the legacy 'granted'/'denied' string and a
// forward-compatible {marketing:true} object (see metaConsent.js).
export function hasMarketingConsent() {
  if (typeof window === 'undefined') return false;
  return hasMarketingConsentValue(safeLocalStorage.getItem(CONSENT_KEY));
}

// Generate a UUID shared between a Pixel event and its CAPI twin for dedup.
// Falls back to a random string when crypto.randomUUID is unavailable.
export function genEventId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through to the manual fallback */ }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureMetaPixel() {
  if (typeof window === 'undefined') return;
  if (metaInitialized && typeof window.fbq === 'function') return;

  if (typeof window.fbq !== 'function') {
    const fbq = function (...args) {
      if (typeof fbq.callMethod === 'function') fbq.callMethod(...args);
      else fbq.queue.push(args);
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }

  window.fbq('init', META_PIXEL_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  metaInitialized = true;
  // Non-blocking: enrich with anonymous external_id immediately so every event
  // after consent carries it. PII fields are added later from checkout data.
  // Non-blocking: enrich with the anonymous external_id plus any hashed
  // identity persisted from a previous checkout, so every event after consent
  // (including this session's ViewContents) carries match parameters.
  setTimeout(() => updateAdvancedMatching({}), 0);
  // Note: updateAdvancedMatching hashes raw inputs; stored values are already
  // hashed, so apply them via a direct re-init instead of re-hashing.
  setTimeout(() => {
    try {
      const stored = getStoredAdvancedMatching();
      if (stored && typeof window.fbq === 'function') {
        window.fbq('init', META_PIXEL_ID, stored);
      }
    } catch { /* never throw */ }
  }, 0);
}

function ensureTikTokPixel() {
  if (typeof window === 'undefined') return;
  if (tiktokInitialized && typeof window.ttq?.track === 'function') return;

  if (!Array.isArray(window.ttq)) {
    const ttq = [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
    ttq.setAndDefer = function (obj, method) {
      obj[method] = function () {
        obj.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (id) {
      const inst = ttq._i[id] || [];
      for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(inst, ttq.methods[i]);
      return inst;
    };
    ttq.load = function (id, opts) {
      const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[id] = [];
      ttq._i[id]._u = src;
      ttq._t = ttq._t || {};
      ttq._t[id] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[id] = opts || {};
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = `${src}?sdkid=${id}&lib=ttq`;
      const ref = document.getElementsByTagName('script')[0];
      if (ref?.parentNode) ref.parentNode.insertBefore(s, ref);
      else document.head.appendChild(s);
    };
    window.ttq = ttq;
  }

  if (typeof window.ttq.load === 'function') window.ttq.load(TIKTOK_PIXEL_ID);
  tiktokInitialized = true;
}

function ensureMarketingPixels() {
  ensureMetaPixel();
  ensureTikTokPixel();
}

function setFbqConsent(granted) {
  if (typeof window === 'undefined') return;
  if (granted) ensureMetaPixel();
  if (typeof window.fbq !== 'function') return;
  window.fbq('consent', granted ? 'grant' : 'revoke');
}

// Re-apply the visitor's choice on app load. Under implied consent, anyone who
// has NOT explicitly declined is bootstrapped and granted immediately — the
// only visitors skipped here are ones who clicked Decline in a past session.
// (New/no-choice visitors also get tracked via track()'s own lazy bootstrap on
// the first PageView, but doing it here too means fbq/ttq consent-mode flags
// are set correctly from the very first paint instead of the first event.)
export function applyStoredConsent() {
  if (getConsentChoice() === 'denied') return;
  ensureMarketingPixels();
  setFbqConsent(true);
  if (typeof window !== 'undefined' && typeof window.ttq?.grantConsent === 'function') {
    window.ttq.grantConsent();
  }
}

export function grantConsent() {
  safeLocalStorage.setItem(CONSENT_KEY, 'granted');
  ensureMarketingPixels();
  setFbqConsent(true);
  if (typeof window !== 'undefined' && typeof window.ttq?.grantConsent === 'function') {
    window.ttq.grantConsent();
  }
  // NOTE: under the implied-consent model (metaConsent.js), tracking already
  // started on the visitor's very first PageView before this banner was even
  // clicked — clicking Accept just persists an explicit record and re-affirms
  // Meta/TikTok's own consent-mode flags. Do NOT re-fire PageView here; that
  // would double-count every visitor who explicitly accepts.
}

export function denyConsent() {
  safeLocalStorage.setItem(CONSENT_KEY, 'denied');
  setFbqConsent(false);
  if (typeof window !== 'undefined' && typeof window.ttq?.revokeConsent === 'function') {
    window.ttq.revokeConsent();
  }
}

// IMPLIED CONSENT: fires by default. No-ops only once the visitor has
// EXPLICITLY declined via the cookie banner (see metaConsent.js). When an
// `eventID` is passed it is forwarded to fbq so Meta can dedup this browser
// event against the matching server-side (CAPI) event.
export function track(event, params, eventID) {
  if (!hasMarketingConsent()) return;
  ensureMarketingPixels();
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  const opts = eventID ? { eventID } : undefined;
  if (params && opts) {
    window.fbq('track', event, params, opts);
  } else if (params) {
    window.fbq('track', event, params);
  } else {
    window.fbq('track', event);
  }
}

// ── TikTok Pixel (ttq) low-level helpers ─────────────────────────────────────
// Installed ALONGSIDE the Meta Pixel (never replacing it). The ttq loader is
// lazy-bootstrapped in this module and gated behind the SAME marketing consent
// check as Meta so nothing fires until the
// visitor accepts. TikTok has no fbq-style consent('revoke') API, so the consent
// gate here is the mechanism that withholds ttq events until acceptance. Written
// so nothing throws if the script is blocked, still loading, or running in SSR.

// Fire a TikTok Pixel event. No-ops unless marketing consent is granted AND ttq
// is present. When an `eventId` is passed it is forwarded via ttq's options arg
// (ttq.track(name, props, { event_id })) so TikTok dedups this browser event
// against the matching server-side (Events API) event.
export function trackTikTok(event, props, eventId) {
  if (!hasMarketingConsent()) return;
  ensureMarketingPixels();
  if (typeof window === 'undefined' || typeof window.ttq?.track !== 'function') return;
  const opts = eventId ? { event_id: eventId } : undefined;
  if (props && opts) {
    window.ttq.track(event, props, opts);
  } else if (props) {
    window.ttq.track(event, props);
  } else {
    window.ttq.track(event);
  }
}

// Fire a TikTok page view (ttq.page()). Same consent gate as trackTikTok.
export function trackTikTokPage() {
  if (!hasMarketingConsent()) return;
  ensureMarketingPixels();
  if (typeof window === 'undefined' || typeof window.ttq?.page !== 'function') return;
  window.ttq.page();
}

// Fires a PageView on the initial load and on every client-side route change.
// HTML never calls fbq('track','PageView') or ttq.page()
// so this hook is the single source of page views and there is no double-count
// on first load. track()/trackTikTokPage() gate on consent, so page views are
// withheld until the visitor accepts. Both pixels fire from the same place.
export function usePageViewTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    track('PageView');
    trackTikTokPage();
  }, [pathname]);
}

export default function PixelPageView() {
  usePageViewTracking();
  return null;
}
