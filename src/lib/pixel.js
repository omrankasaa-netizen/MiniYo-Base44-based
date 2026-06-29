import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Meta (Facebook) Pixel helpers.
// The base snippet (fbq + init) is installed in index.html so it loads before
// React mounts. These helpers only *send* events and are written so nothing
// throws if the script is blocked, still loading, or running during SSR.

export function track(event, params) {
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
