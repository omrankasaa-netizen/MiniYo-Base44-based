// Meta Conversions API (server-side) client.
//
// Sends server events (currently Purchase) to the Graph API. Responsibilities:
//   - Read pixel id / access token / test code from env (never hard-coded).
//   - SHA-256 hash PII (email, phone) after normalization; pass ip/ua/fbp/fbc
//     through unhashed as Meta expects.
//   - POST to the Graph API and surface the response for diagnostics.
//   - NEVER log the access token or any raw/hashed PII.
//   - Never throw in a way that breaks the caller's order flow.
//
// All the payload-building pieces are exported as pure functions so they can be
// unit-tested without network access or secrets.

import crypto from 'node:crypto';

// Pin a stable, recent Graph API version.
export const GRAPH_VERSION = 'v21.0';

// Non-secret. The public pixel id; overridable via env for other environments.
const DEFAULT_PIXEL_ID = '1480243427454221';

export function getPixelId() {
  return process.env.MINIYO_META_PIXEL_ID || DEFAULT_PIXEL_ID;
}

// ── Normalization + hashing ─────────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Best-effort E.164 digits (no '+'). The store's market is Lebanon, so a bare
// local number (<= 8 digits after dropping trunk zeros) gets the 961 country
// code prepended. FLAG: this Lebanon assumption should be revisited if the
// store ever ships internationally.
export function normalizePhone(phone) {
  let c = String(phone || '').replace(/\D/g, '');
  if (!c) return '';
  if (c.startsWith('961')) return c;
  c = c.replace(/^0+/, '');
  if (!c) return '';
  if (c.length <= 8) c = `961${c}`;
  return c;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Hash a value only if it is non-empty; returns undefined otherwise so the key
// can be omitted from the payload.
function hashOrUndefined(normalized) {
  return normalized ? sha256(normalized) : undefined;
}

// Build Meta `user_data`. email/phone are hashed; ip/ua/fbp/fbc are sent raw.
// Returns only the keys that have values.
export function buildUserData({ email, phone, clientIp, userAgent, fbp, fbc } = {}) {
  const em = hashOrUndefined(normalizeEmail(email));
  const ph = hashOrUndefined(normalizePhone(phone));
  const data = {};
  if (em) data.em = [em];
  if (ph) data.ph = [ph];
  if (clientIp) data.client_ip_address = clientIp;
  if (userAgent) data.client_user_agent = userAgent;
  if (fbp) data.fbp = fbp;
  if (fbc) data.fbc = fbc;
  return data;
}

// ── Content / custom_data helpers ───────────────────────────────────────────

// Normalize order/cart lines to Meta `contents`. Uses sku as the id and skips
// any line missing a sku (never emits undefined ids). Returns { contents,
// contentIds, skipped } where skipped counts dropped (sku-less) lines.
export function buildContents(items = []) {
  const contents = [];
  let skipped = 0;
  for (const it of items) {
    const id = it?.sku;
    if (!id) { skipped += 1; continue; }
    const quantity = Number(it.quantity) || 1;
    const price = Number(it.unit_price_usd ?? it.item_price);
    contents.push({
      id,
      quantity,
      ...(Number.isFinite(price) ? { item_price: price } : {}),
    });
  }
  return { contents, contentIds: contents.map((c) => c.id), skipped };
}

// A single CAPI event envelope. Undefined optional fields are dropped.
export function buildEventPayload({
  eventName, eventId, eventTime, eventSourceUrl, actionSource = 'website',
  userData = {}, customData = {},
}) {
  const event = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData,
    custom_data: customData,
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  return event;
}

// ── Send ────────────────────────────────────────────────────────────────────

// POST a single event to the Graph API. Resolves to a structured result and
// never rejects — callers can safely ignore the promise. Skips (no-op) when the
// access token is not configured so builds/tests don't require a secret.
export async function sendCapiEvent({
  eventName, eventId, eventTime, eventSourceUrl, actionSource, userData, customData,
}) {
  const pixelId = getPixelId();
  const token = process.env.MINIYO_META_CAPI_ACCESS_TOKEN;
  const testCode = process.env.MINIYO_META_TEST_EVENT_CODE;

  if (!token) {
    console.warn('[metaCapi] MINIYO_META_CAPI_ACCESS_TOKEN not set — skipping CAPI send');
    return { ok: false, skipped: 'no_token' };
  }

  const event = buildEventPayload({
    eventName, eventId, eventTime, eventSourceUrl, actionSource, userData, customData,
  });
  const body = { data: [event] };
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Log status + Meta's error message/trace, never the token or PII.
      console.error('[metaCapi] send failed', {
        event: eventName,
        status: resp.status,
        error: json?.error?.message,
        fbtrace_id: json?.error?.fbtrace_id,
      });
      return { ok: false, status: resp.status, error: json?.error };
    }
    console.log('[metaCapi] sent', {
      event: eventName,
      events_received: json?.events_received,
      fbtrace_id: json?.fbtrace_id,
      messages: json?.messages,
    });
    return { ok: true, response: json };
  } catch (e) {
    console.error('[metaCapi] send error', { event: eventName, message: e?.message });
    return { ok: false, error: e?.message };
  }
}
