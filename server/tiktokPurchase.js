// CompletePayment (server-side TikTok Events API) orchestration built from
// trusted order data — the TikTok twin of metaPurchase.js.
//
// Pure builders live here (tested directly); the Express route in index.js loads
// the Order + OrderItems from the DB, enforces idempotency + consent, and calls
// sendTikTokEvent with what buildPurchaseProperties / buildPurchaseUserData
// return.

import { buildContents, buildUserData } from './tiktokEventsClient.js';

// Deterministic event_id per order so Pixel/Events-API dedup works and retries
// collapse to one event. Reuses the browser-generated id stored on the order
// (the SAME id Meta uses) so a single logical purchase shares one id; otherwise
// derives a stable id from the order number/id.
export function derivePurchaseEventId(order) {
  if (order?.meta_event_id) return String(order.meta_event_id);
  return `purchase-${order?.order_number || order?.id}`;
}

// Guard currency to USD (the store's only currency) when missing/blank.
export function resolveCurrency(order) {
  const c = String(order?.currency || '').trim();
  return c || 'USD';
}

// Build CompletePayment properties from the order + its line items. `value`
// comes from the order's grand total (trusted server value). Returns
// { properties, value, skippedItems }.
export function buildPurchaseProperties(order, items = []) {
  const { contents, contentIds, skipped } = buildContents(items);
  const value = Number(order?.grand_total_usd);
  const properties = {
    currency: resolveCurrency(order),
    value: Number.isFinite(value) ? value : 0,
    content_type: 'product',
    content_ids: contentIds,
    contents,
  };
  return { properties, value: properties.value, skippedItems: skipped };
}

// Build CompletePayment user from the order's contact fields + request signals.
export function buildPurchaseUserData(order, req = {}) {
  return buildUserData({
    email: order?.customer_email,
    phone: order?.customer_phone,
    clientIp: req.clientIp,
    userAgent: req.userAgent,
    ttp: req.ttp,
    ttclid: req.ttclid,
  });
}

// Marketing consent gate: fire only when the order did not explicitly record a
// declined choice. `meta_consent === false` means the visitor declined (the same
// stored flag gates both Meta + TikTok since they share one consent banner).
export function purchaseConsentAllowed(order) {
  return order?.meta_consent !== false;
}

// A CompletePayment should only be sent for a real sale: value must be a finite
// number greater than zero.
export function isSendableValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}
