import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { safeLocalStorage } from '@/lib/safeStorage';

// Meta (Facebook) Pixel helpers.
// The base snippet (fbq + init) is installed in index.html so it loads before
// React mounts. index.html also calls fbq('consent','revoke') BEFORE init, so
// the Pixel withholds cookies (_fbp/_fbc) and events until the visitor accepts.
// These helpers only *send* events and are written so nothing throws if the
// script is blocked, still loading, or running during SSR.

const CONSENT_KEY = 'miniyo-consent';

// Returns 'granted' | 'denied' | null (no choice stored yet).
export function getConsentChoice() {
  if (typeof window === 'undefined') return null;
  const v = safeLocalStorage.getItem(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : null;
}

export function hasConsent() {
  return getConsentChoice() === 'granted';
}

function setFbqConsent(granted) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('consent', granted ? 'grant' : 'revoke');
}

// Re-apply a previously stored choice to the Pixel on app load. Consent is
// revoked by default in index.html, so we only need to *grant* when the visitor
// accepted on a previous visit. Declines leave the default revoked state.
export function applyStoredConsent() {
  if (hasConsent()) setFbqConsent(true);
}

export function grantConsent() {
  safeLocalStorage.setItem(CONSENT_KEY, 'granted');
  setFbqConsent(true);
  // Count the page the visitor accepted on (the initial PageView was withheld
  // while consent was still revoked).
  track('PageView');
}

export function denyConsent() {
  safeLocalStorage.setItem(CONSENT_KEY, 'denied');
  setFbqConsent(false);
}

// No-ops unless the visitor has granted consent, so no events fire (and Meta's
// Consent Mode prevents cookies) until then.
export function track(event, params) {
  if (!hasConsent()) return;
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  if (params) {
    window.fbq('track', event, params);
  } else {
    window.fbq('track', event);
  }
}

// Fires a PageView on the initial load and on every client-side route change.
// index.html intentionally does NOT call fbq('track','PageView') so this hook is
// the single source of PageViews and there is no double-count on first load.
// track() gates on consent, so PageViews are withheld until the visitor accepts.
export function usePageViewTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    track('PageView');
  }, [pathname]);
}

export default function PixelPageView() {
  usePageViewTracking();
  return null;
}
