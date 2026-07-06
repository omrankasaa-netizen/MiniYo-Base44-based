// Pure (DOM-free) builders for Meta Pixel event payloads.
//
// Kept free of React / window / '@/' alias imports so the payload shapes can be
// unit-tested directly under node:test (same rationale as metaConsent.js). The
// side-effecting fbq calls + consent gating live in metaPixel.js / pixel.js.
//
// The canonical content identifier is the product `sku` (matching the catalog
// feed, JSON-LD and server CAPI); we fall back to the internal id only so we
// never emit undefined.

// Canonical SKU normalizer for the Meta boundary: uppercase + trim so the value
// placed into content_ids / contents[].id can never mismatch the catalog feed on
// casing or whitespace (Meta catalog matching is CASE-SENSITIVE). Null-safe →
// returns '' for a missing sku.
// KEEP IN SYNC with normalizeSku in server/metaFeed.js — identical logic (the
// frontend ESM/Vite bundle and the Node backend can't easily share one module).
export function normalizeSku(sku) {
  if (sku == null) return '';
  return String(sku).trim().toUpperCase();
}

export function contentId(product) {
  const raw = product?.sku || product?.id;
  return raw ? normalizeSku(raw) : null;
}

export function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// AddToWishlist. Returns null when the product has no usable id so the caller
// can skip firing. content_ids:[sku], content_type, content_name, value, currency.
export function buildAddToWishlistParams(product) {
  const id = contentId(product);
  if (!id) return null;
  const price = toNumber(product.price_usd);
  return {
    content_ids: [id],
    content_type: 'product',
    content_name: product.name,
    value: price,
    currency: 'USD',
    contents: [{ id, quantity: 1, item_price: price }],
  };
}

// CompleteRegistration. Standard params only — never any raw PII.
export function buildCompleteRegistrationParams() {
  return {
    content_name: 'Account Registration',
    status: true,
    currency: 'USD',
  };
}

// Lead — free email signup (newsletter). Raw email is never included.
export function buildLeadParams(contentName = 'Newsletter Signup') {
  return { content_name: contentName };
}

// Contact — customer-service / inquiry contact (e.g. a WhatsApp chat link).
export function buildContactParams(channel = 'WhatsApp') {
  return { content_name: channel };
}
