// Client-originated TikTok Events API events (ViewContent / AddToCart /
// InitiateCheckout) — the TikTok twin of metaTrack.js.
//
// The browser Pixel fires these with a dedup `event_id`; the storefront then
// hands the same id + NON-PII properties to POST /api/tiktok/track so the server
// sends the deduplicated Events API twin. user (ip/ua/ttp/ttclid) is derived
// server-side from the request — never trusted from the client. CompletePayment
// is deliberately NOT in this allowlist: it fires only from the trusted server
// order flow (see server/tiktokPurchase.js).
//
// All builders are pure so they can be unit-tested without network or secrets.

import { normalizeSku } from './metaFeed.js';

// Events the /api/tiktok/track route will forward to the Events API.
// CompletePayment is excluded on purpose so a spoofed client body can never mint
// a purchase conversion.
export const TRACK_EVENTS = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout']);

export function isTrackEvent(name) {
  return TRACK_EVENTS.has(name);
}

// Normalize a single id at the TikTok boundary; returns null when empty so it
// can be dropped (never emit an undefined/empty content id).
function normId(value) {
  return normalizeSku(value) || null;
}

// Sanitize client-sent `contents` → [{ content_id, content_type, quantity,
// price? }] with ids normalized through the same normalizeSku the feed uses.
// Drops id-less lines.
export function sanitizeContents(contents) {
  const out = [];
  for (const c of Array.isArray(contents) ? contents : []) {
    const id = normId(c?.content_id ?? c?.id);
    if (!id) continue;
    const quantity = Number(c?.quantity) || 1;
    const price = Number(c?.price ?? c?.item_price);
    out.push({
      content_id: id,
      content_type: 'product',
      quantity,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return out;
}

// Build TikTok `properties` from the client-sent NON-PII fields. content_ids are
// re-normalized so they always match the catalog feed id. value/currency are
// carried through when present.
export function buildTrackProperties(input = {}) {
  const contents = sanitizeContents(input.contents);

  let contentIds = contents.map((c) => c.content_id);
  if (!contentIds.length && Array.isArray(input.content_ids)) {
    contentIds = input.content_ids.map(normId).filter(Boolean);
  }

  const properties = {
    content_type: 'product',
    content_ids: contentIds,
  };
  if (contents.length) properties.contents = contents;

  const value = Number(input.value);
  if (Number.isFinite(value)) {
    properties.value = value;
    const cur = String(input.currency || 'USD').trim().toUpperCase();
    properties.currency = cur || 'USD';
  }

  return properties;
}
