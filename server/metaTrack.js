// Client-originated Meta CAPI events (ViewContent / AddToCart / InitiateCheckout).
//
// The browser Pixel fires these with a dedup `event_id`; the storefront then
// hands the same id + NON-PII custom_data to POST /api/meta/track so the server
// sends the deduplicated CAPI twin. user_data (ip/ua/fbp/fbc) is derived
// server-side from the request — never trusted from the client. Purchase is
// deliberately NOT in this allowlist: it fires only from the trusted server
// order flow (see server/metaPurchase.js).
//
// All builders are pure so they can be unit-tested without network or secrets.

import { normalizeSku } from './metaFeed.js';

// Events the /api/meta/track route will forward to CAPI. Purchase is excluded
// on purpose so a spoofed client body can never mint a Purchase conversion.
export const TRACK_EVENTS = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout']);

export function isTrackEvent(name) {
  return TRACK_EVENTS.has(name);
}

// Normalize a single id at the Meta boundary; returns null when empty so it can
// be dropped (never emit an undefined/empty content id).
function normId(value) {
  return normalizeSku(value) || null;
}

// Sanitize client-sent `contents` → [{ id, quantity, item_price? }] with ids
// normalized through the same normalizeSku the feed uses. Drops id-less lines.
export function sanitizeContents(contents) {
  const out = [];
  for (const c of Array.isArray(contents) ? contents : []) {
    const id = normId(c?.id);
    if (!id) continue;
    const quantity = Number(c?.quantity) || 1;
    const price = Number(c?.item_price);
    out.push({ id, quantity, ...(Number.isFinite(price) ? { item_price: price } : {}) });
  }
  return out;
}

// Build CAPI `custom_data` from the client-sent NON-PII fields. content_ids are
// re-normalized so they always match the catalog feed id (case-sensitive Meta
// matching). value/currency are carried through when present.
export function buildTrackCustomData(input = {}) {
  const contents = sanitizeContents(input.contents);

  let contentIds = contents.map((c) => c.id);
  if (!contentIds.length && Array.isArray(input.content_ids)) {
    contentIds = input.content_ids.map(normId).filter(Boolean);
  }

  const custom = {
    content_type: 'product',
    content_ids: contentIds,
  };
  if (contents.length) custom.contents = contents;

  const value = Number(input.value);
  if (Number.isFinite(value)) {
    custom.value = value;
    const cur = String(input.currency || 'USD').trim().toUpperCase();
    custom.currency = cur || 'USD';
  }

  const numItems = Number(input.num_items);
  if (Number.isFinite(numItems) && numItems > 0) custom.num_items = numItems;

  return custom;
}
