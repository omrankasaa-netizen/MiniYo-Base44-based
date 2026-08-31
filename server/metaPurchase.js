// Purchase (server-side CAPI) orchestration built from trusted order data.
//
// Pure builders live here (tested directly); the Express route in index.js
// loads the Order + OrderItems from the DB, enforces idempotency + consent, and
// calls sendCapiEvent with what buildPurchaseCustomData / buildPurchaseUserData
// return.

import * as metaCapi from './metaCapiClient.js';
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
// Adds first/last name (split from customer_name), city, district (Meta's `st`)
// and the store's country so the Purchase event earns full EMQ credit. All of
// these are normalized + SHA-256 hashed inside buildUserData.
export function buildPurchaseUserData(order, req = {}, { externalIdHash } = {}) {
  const nameParts = String(order?.customer_name || '').trim().split(/\s+/);
  const data = buildUserData({
    email: order?.customer_email,
    phone: order?.customer_phone,
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ') || undefined,
    city: order?.city,
    state: order?.district,
    // The storefront sells/ships in Lebanon; use the order's phone country when
    // present (ISO alpha-2), falling back to 'lb'.
    country: (order?.phone_country || 'lb').toLowerCase(),
    clientIp: req.clientIp,
    userAgent: req.userAgent,
    fbp: req.fbp,
    fbc: req.fbc,
  });
  // Consistent external_id across Pixel + CAPI (Meta recommendation): prefer
  // the browser's hashed visitor id (validated 64-hex upstream) so the CAPI
  // Purchase stitches to the same profile as the pixel events; otherwise fall
  // back to a stable server-side id (customer id, else the order email) so the
  // event still carries a cross-session identifier.
  const { sha256 } = metaCapi;
  const ext = (typeof externalIdHash === 'string' && /^[0-9a-f]{64}$/.test(externalIdHash))
    ? externalIdHash
    : (order?.customer_id || order?.customer_email)
      ? sha256(String(order.customer_id || order.customer_email).trim().toLowerCase())
      : null;
  if (ext) data.external_id = [ext];
  return data;
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
