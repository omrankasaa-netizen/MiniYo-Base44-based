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

// Re-apply a previously stored choice on app load. If previously granted, lazy
// bootstrap pixels and grant consent immediately so first route PageView is kept.
export function applyStoredConsent() {
  if (!hasConsent()) return;
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
  // Count the page the visitor accepted on (the initial page view was withheld
  // while consent was still revoked) — for both the Meta and TikTok pixels.
  track('PageView');
  trackTikTokPage();
}

export function denyConsent() {
  safeLocalStorage.setItem(CONSENT_KEY, 'denied');
  setFbqConsent(false);
  if (typeof window !== 'undefined' && typeof window.ttq?.revokeConsent === 'function') {
    window.ttq.revokeConsent();
  }
}

// No-ops unless the visitor has granted marketing consent, so no events fire
// (and Meta's Consent Mode prevents cookies) until then. When an `eventID` is
// passed it is forwarded to fbq so Meta can dedup this browser event against the
// matching server-side (CAPI) event.
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
