// Semantic TikTok Pixel event helpers for the storefront — the TikTok twin of
// metaPixel.js, installed ALONGSIDE the Meta Pixel (never replacing it).
//
// This is the high-level surface the app should call. It builds TikTok-standard
// payloads with the canonical product `sku` as content_id everywhere (matching
// the catalog feed + Meta content_ids), generates dedup event_ids, and delegates
// the actual ttq call (and consent gating) to the low-level helpers in pixel.js.
//
// CompletePayment is intentionally NOT sent from the browser — it fires
// server-side via the Events API (see server/tiktokPurchase.js) from trusted
// order data, exactly like the Meta Purchase.

import { trackTikTok, genEventId, hasMarketingConsent } from '@/lib/pixel';
import { contentId } from '@/lib/metaEventParams';

export { genEventId, hasMarketingConsent };

// Public (non-secret) TikTok Pixel ID. The ttq base loader in index.html
// initializes with this same default; VITE_TIKTOK_PIXEL_ID lets a non-prod build
// override it. Mirrors how META_PIXEL_ID is handled in metaPixel.js.
export const TIKTOK_PIXEL_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TIKTOK_PIXEL_ID) ||
  'D9BP18JC77U1026616UG';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Hand a browser event off to the server-side Events API twin
// (POST /api/tiktok/track) using the SAME event_id passed to ttq so TikTok dedups
// the pair. Only non-PII properties are forwarded; the server derives
// ip/ua/ttp/ttclid itself. CompletePayment never flows through here — it fires
// from the trusted server order flow.
function postEventsApiTrack(eventName, eventId, props) {
  try {
    fetch('/api/tiktok/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: typeof window !== 'undefined' ? window.location?.href : undefined,
        content_ids: props.content_ids,
        contents: props.contents,
        content_type: props.content_type,
        value: props.value,
        currency: props.currency,
      }),
      keepalive: true,
    }).catch(() => { /* tracking must never break the UX */ });
  } catch { /* never throw into a render/click handler */ }
}

// Fire a Pixel event with a shared dedup event_id, then (only when marketing
// consent is granted, matching the Pixel gate) hand the same id to the server
// Events API twin.
function trackDeduped(eventName, props) {
  const eventId = genEventId();
  trackTikTok(eventName, props, eventId);
  if (hasMarketingConsent()) postEventsApiTrack(eventName, eventId, props);
}

// PDP view. content_id:[sku], value, currency, contents.
export function ttViewContent(product) {
  const id = contentId(product);
  if (!id) return;
  const price = toNumber(product.price_usd);
  trackDeduped('ViewContent', {
    content_type: 'product',
    content_ids: [id],
    contents: [{ content_id: id, content_type: 'product', quantity: 1, price }],
    value: price,
    currency: 'USD',
  });
}

// Add-to-cart (both storefront card quick-add and PDP add flow through here via
// useCart().addItem). value is the line value (unit price × quantity).
export function ttAddToCart({ product, variant, quantity = 1 }) {
  const id = contentId(product);
  if (!id) return;
  const unitPrice = toNumber(variant?.price_usd ?? product?.price_usd);
  trackDeduped('AddToCart', {
    content_type: 'product',
    content_ids: [id],
    contents: [{ content_id: id, content_type: 'product', quantity, price: unitPrice }],
    value: unitPrice * quantity,
    currency: 'USD',
  });
}

// Checkout start. Aggregates all cart lines. `items` are decorated cart items
// ({ product, variant, quantity, price }).
export function ttInitiateCheckout({ items = [], value }) {
  const contents = items
    .map((i) => {
      const id = contentId(i.product);
      return id
        ? { content_id: id, content_type: 'product', quantity: i.quantity, price: toNumber(i.price) }
        : null;
    })
    .filter(Boolean);
  trackDeduped('InitiateCheckout', {
    content_type: 'product',
    content_ids: contents.map((c) => c.content_id),
    contents,
    value: toNumber(value),
    currency: 'USD',
  });
}

// Search submit. TikTok standard `Search` event; query is the free-text string
// and result skus are optional content_ids. Consent-gated via trackTikTok.
export function ttSearch(searchString, resultSkus = []) {
  const str = String(searchString || '').trim();
  if (!str) return;
  const ids = resultSkus.filter(Boolean);
  trackTikTok('Search', {
    query: str,
    ...(ids.length ? { content_ids: ids, content_type: 'product' } : {}),
  });
}

// Successful account registration. TikTok standard CompleteRegistration. No raw
// PII is ever forwarded to the Pixel.
export function ttCompleteRegistration() {
  trackTikTok('CompleteRegistration', { content_name: 'Account Registration' });
}

// Contact — customer-service / inquiry contact (e.g. tapping a WhatsApp chat
// link). TikTok standard Contact event.
export function ttContact(channel = 'WhatsApp') {
  trackTikTok('Contact', { content_name: channel });
}

// Tell the backend to fire the server-side CompletePayment Events API event for
// an order. The server reads the order (value, line items, hashed contact,
// stored meta_event_id + meta_consent) from the DB — nothing money-related is
// trusted from the client. Best-effort: never throws into the checkout flow.
export async function ttNotifyPurchase(orderId) {
  if (!orderId) return;
  try {
    await fetch('/api/tiktok/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
      keepalive: true,
    });
  } catch {
    // Tracking must never break the order confirmation UX.
  }
}
