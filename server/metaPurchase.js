// Purchase (server-side CAPI) orchestration built from trusted order data.
//
// Pure builders live here (tested directly); the Express route in index.js
// loads the Order + OrderItems from the DB, enforces idempotency + consent, and
// calls sendCapiEvent with what buildPurchaseCustomData / buildPurchaseUserData
// return.

import { buildContents, buildUserData } from './metaCapiClient.js';

// Deterministic event_id per order so Pixel/CAPI dedup works and CAPI retries
// collapse to one event. Reuses the browser-generated id stored on the order;
// otherwise derives a stable id from the order number/id.
export function derivePurchaseEventId(order) {
  if (order?.meta_event_id) return String(order.meta_event_id);
  return `purchase-${order?.order_number || order?.id}`;
}

// Guard currency to USD (the store's only currency) when missing/blank.
export function resolveCurrency(order) {
  const c = String(order?.currency || '').trim();
  return c || 'USD';
}

// Build Purchase custom_data from the order + its line items. `value` comes from
// the order's grand total (trusted server value). Returns { customData, value,
// skippedItems }.
export function buildPurchaseCustomData(order, items = []) {
  const { contents, contentIds, skipped } = buildContents(items);
  const value = Number(order?.grand_total_usd);
  const customData = {
    currency: resolveCurrency(order),
    value: Number.isFinite(value) ? value : 0,
    content_type: 'product',
    content_ids: contentIds,
    contents,
    order_id: order?.order_number || order?.id,
    num_items: contents.reduce((s, c) => s + (c.quantity || 0), 0),
  };
  return { customData, value: customData.value, skippedItems: skipped };
}

// Build Purchase user_data from the order's contact fields + request signals.
export function buildPurchaseUserData(order, req = {}) {
  return buildUserData({
    email: order?.customer_email,
    phone: order?.customer_phone,
    clientIp: req.clientIp,
    userAgent: req.userAgent,
    fbp: req.fbp,
    fbc: req.fbc,
  });
}

// Marketing consent gate: fire only when the order did not explicitly record a
// declined choice. `meta_consent === false` means the visitor declined.
export function purchaseConsentAllowed(order) {
  return order?.meta_consent !== false;
}

// A Purchase should only be sent for a real sale: value must be a finite number
// greater than zero.
export function isSendableValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}
