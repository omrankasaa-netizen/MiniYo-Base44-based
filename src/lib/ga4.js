import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const GA4_MEASUREMENT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA4_MEASUREMENT_ID) || '';

let ga4Configured = false;
let ga4ScriptInjected = false;

function getMeasurementId() {
  return String(GA4_MEASUREMENT_ID || '').trim();
}

export function isGa4Enabled() {
  return !!getMeasurementId();
}

function ensureGtag() {
  if (typeof window === 'undefined') return null;
  const measurementId = getMeasurementId();
  if (!measurementId) return null;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  if (!ga4ScriptInjected) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    ga4ScriptInjected = true;
  }

  if (!ga4Configured) {
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: false });
    ga4Configured = true;
  }

  return window.gtag;
}

export function ga4Track(eventName, params = {}) {
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag('event', eventName, params);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ga4ItemId(product, fallback) {
  return String(product?.sku || product?.id || fallback || '');
}

function cartLineToGa4Item(line, fallback) {
  const product = line?.product || {};
  const variant = line?.variant || {};
  const itemId = ga4ItemId(product, fallback);
  if (!itemId) return null;
  return {
    item_id: itemId,
    item_name: String(product?.name || itemId),
    ...(product?.category_name ? { item_category: String(product.category_name) } : {}),
    ...(variant?.size ? { item_variant: String(variant.size) } : {}),
    price: toNumber(line?.price ?? variant?.price_usd ?? product?.price_usd),
    quantity: Math.max(1, Number(line?.quantity) || 1),
  };
}

export function mapCartItemsToGa4Items(items = []) {
  return items
    .map((line, idx) => cartLineToGa4Item(line, `line-${idx + 1}`))
    .filter(Boolean);
}

export function ga4TrackPageView() {
  if (typeof window === 'undefined') return;
  ga4Track('page_view', {
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search || ''}`,
    page_title: document.title,
  });
}

export function ga4TrackViewItem(product) {
  const itemId = ga4ItemId(product);
  if (!itemId) return;
  const item = {
    item_id: itemId,
    item_name: String(product?.name || itemId),
    ...(product?.category_name ? { item_category: String(product.category_name) } : {}),
    price: toNumber(product?.price_usd),
    quantity: 1,
  };
  ga4Track('view_item', {
    currency: 'USD',
    value: item.price,
    items: [item],
  });
}

export function ga4TrackAddToCart({ product, variant, quantity = 1 }) {
  const item = cartLineToGa4Item(
    {
      product,
      variant,
      quantity,
      price: variant?.price_usd ?? product?.price_usd,
    },
    product?.name,
  );
  if (!item) return;
  ga4Track('add_to_cart', {
    currency: 'USD',
    value: toNumber(item.price) * (Number(item.quantity) || 1),
    items: [item],
  });
}

export function ga4TrackBeginCheckout({ items = [], value = 0, currency = 'USD' }) {
  ga4Track('begin_checkout', {
    currency: String(currency || 'USD').toUpperCase(),
    value: toNumber(value),
    items: mapCartItemsToGa4Items(items),
  });
}

export function ga4TrackPurchase({
  orderNumber,
  orderId,
  value,
  currency = 'USD',
  shipping = 0,
  coupon,
  items = [],
}) {
  const transactionId = String(orderNumber || orderId || '').trim();
  if (!transactionId) return;
  ga4Track('purchase', {
    transaction_id: transactionId,
    ...(orderId ? { order_id: String(orderId) } : {}),
    currency: String(currency || 'USD').toUpperCase(),
    value: toNumber(value),
    shipping: toNumber(shipping),
    ...(coupon ? { coupon: String(coupon) } : {}),
    items: mapCartItemsToGa4Items(items),
  });
}

export function useGa4PageViewTracking() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    ga4TrackPageView();
  }, [pathname, search]);
}

export default function Ga4PageView() {
  useGa4PageViewTracking();
  return null;
}
