// Semantic Meta Pixel event helpers for the storefront.
//
// This is the high-level surface the app should call. It builds Meta-standard
// payloads with the canonical product `sku` as content_ids everywhere (matching
// the catalog feed + server CAPI), generates dedup event_ids, and delegates the
// actual fbq call (and consent gating) to the low-level helpers in pixel.js.
//
// Purchase is intentionally NOT sent from the browser — it fires server-side via
// the Conversions API (see server/metaCapiClient.js) from trusted order data.

import { track, genEventId, hasMarketingConsent } from '@/lib/pixel';
import {
  contentId,
  buildAddToWishlistParams,
  buildCompleteRegistrationParams,
  buildLeadParams,
  buildContactParams,
} from '@/lib/metaEventParams';

export { genEventId, hasMarketingConsent };

// Public (non-secret) Pixel ID. The fbq base snippet in index.html initializes
// with this same default; VITE_META_PIXEL_ID lets a non-prod build override it.
export const META_PIXEL_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_META_PIXEL_ID) ||
  '1480243427454221';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// PDP view. content_ids:[sku], value, currency, content_name.
export function trackViewContent(product) {
  const id = contentId(product);
  if (!id) return;
  const price = toNumber(product.price_usd);
  track('ViewContent', {
    content_ids: [id],
    content_type: 'product',
    content_name: product.name,
    ...(product.category_name ? { content_category: product.category_name } : {}),
    value: price,
    currency: 'USD',
    contents: [{ id, quantity: 1, item_price: price }],
  });
}

// Add-to-cart (both storefront card quick-add and PDP add flow through here via
// useCart().addItem). value is the line value (unit price × quantity).
export function trackAddToCart({ product, variant, quantity = 1 }) {
  const id = contentId(product);
  if (!id) return;
  const unitPrice = toNumber(variant?.price_usd ?? product?.price_usd);
  track('AddToCart', {
    content_ids: [id],
    content_type: 'product',
    content_name: product.name,
    value: unitPrice * quantity,
    currency: 'USD',
    contents: [{ id, quantity, item_price: unitPrice }],
  });
}

// Checkout start. Aggregates all cart lines. `items` are decorated cart items
// ({ product, variant, quantity, price }).
export function trackInitiateCheckout({ items = [], value }) {
  const contents = items
    .map((i) => {
      const id = contentId(i.product);
      return id ? { id, quantity: i.quantity, item_price: toNumber(i.price) } : null;
    })
    .filter(Boolean);
  track('InitiateCheckout', {
    content_ids: contents.map((c) => c.id),
    content_type: 'product',
    contents,
    value: toNumber(value),
    currency: 'USD',
    num_items: items.reduce((s, i) => s + (i.quantity || 0), 0),
  });
}

// Search submit. search_string is required; result skus are optional.
export function trackSearch(searchString, resultSkus = []) {
  const str = String(searchString || '').trim();
  if (!str) return;
  const ids = resultSkus.filter(Boolean);
  track('Search', {
    search_string: str,
    ...(ids.length ? { content_ids: ids, content_type: 'product' } : {}),
  });
}

// Add-to-wishlist. Fires only when a product is ADDED (never on remove/toggle-off
// — the caller is responsible for calling this on the add path only).
export function trackAddToWishlist(product) {
  const params = buildAddToWishlistParams(product);
  if (!params) return;
  track('AddToWishlist', params);
}

// Successful account registration. Standard params only — no raw PII (email,
// name, etc.) is ever forwarded to the Pixel.
export function trackCompleteRegistration() {
  track('CompleteRegistration', buildCompleteRegistrationParams());
}

// Lead — free email signup (newsletter). A no-cost email capture is a Lead, not
// the paid `Subscribe` event. The raw email is never sent to the Pixel.
export function trackLead(contentName = 'Newsletter Signup') {
  track('Lead', buildLeadParams(contentName));
}

// Contact — customer-service / inquiry contact (e.g. tapping a WhatsApp chat
// link). Not for order placement, which maps to InitiateCheckout / Purchase.
export function trackContact(channel = 'WhatsApp') {
  track('Contact', buildContactParams(channel));
}

// Tell the backend to fire the server-side Purchase CAPI event for an order.
// The server reads the order (value, line items, hashed contact, stored
// meta_event_id + meta_consent) from the DB — nothing money-related is trusted
// from the client. Best-effort: never throws into the checkout flow.
export async function notifyPurchase(orderId) {
  if (!orderId) return;
  try {
    await fetch('/api/meta/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
      keepalive: true,
    });
  } catch {
    // Tracking must never break the order confirmation UX.
  }
}
