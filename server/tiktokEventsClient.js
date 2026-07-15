// TikTok Events API (server-side) client — the TikTok twin of metaCapiClient.js.
//
// Sends server events (CompletePayment + the browser-originated commerce events)
// to the TikTok Events API 2.0. Responsibilities mirror the Meta client exactly:
//   - Read pixel id / access token / test code from env (never hard-coded).
//   - SHA-256 hash PII (email, phone) after normalization; pass ip/ua/ttp/ttclid
//     through unhashed as TikTok expects.
//   - POST to the Events API and surface the response for diagnostics.
//   - NEVER log the access token or any raw/hashed PII.
//   - Never throw in a way that breaks the caller's order flow.
//   - No-op (never hit the network) when the access token is unset, so builds
//     and tests don't require a secret.
//
// PII normalization + hashing are REUSED from metaCapiClient.js so there is a
// single source of truth for how email/phone are canonicalized before hashing.
// content_ids reuse normalizeSku from metaFeed.js so TikTok content_ids match
// the catalog feed + Meta ids exactly.
//
// All the payload-building pieces are exported as pure functions so they can be
// unit-tested without network access or secrets.

import { normalizeSku } from './metaFeed.js';
import { normalizeEmail, normalizePhone, sha256 } from './metaCapiClient.js';

// TikTok Events API 2.0 endpoint.
export const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// Non-secret. The public TikTok pixel id; overridable via env for other
// environments. Mirrors DEFAULT_PIXEL_ID in metaCapiClient.js.
const DEFAULT_PIXEL_ID = 'D9BP18JC77U1026616UG';

export function getPixelId() {
  return process.env.MINIYO_TIKTOK_PIXEL_ID || DEFAULT_PIXEL_ID;
}

// ── Hashing (reuses the Meta normalizers) ────────────────────────────────────

// Hash a value only if it is non-empty; returns undefined otherwise so the key
// can be omitted from the payload.
function hashOrUndefined(normalized) {
  return normalized ? sha256(normalized) : undefined;
}

// Build TikTok `user`. email/phone are hashed; ip/user_agent/ttp/ttclid are sent
// raw. Returns only the keys that have values.
export function buildUserData({ email, phone, clientIp, userAgent, ttp, ttclid } = {}) {
  const em = hashOrUndefined(normalizeEmail(email));
  const ph = hashOrUndefined(normalizePhone(phone));
  const user = {};
  if (em) user.email = em;
  if (ph) user.phone = ph;
  if (clientIp) user.ip = clientIp;
  if (userAgent) user.user_agent = userAgent;
  if (ttp) user.ttp = ttp;
  if (ttclid) user.ttclid = ttclid;
  return user;
}

// ── Content / properties helpers ─────────────────────────────────────────────

// Normalize order/cart lines to TikTok `contents`. Uses sku as content_id and
// skips any line missing a sku (never emits undefined ids). Returns { contents,
// contentIds, skipped } where skipped counts dropped (sku-less) lines.
export function buildContents(items = []) {
  const contents = [];
  let skipped = 0;
  for (const it of items) {
    // Normalize the sku at the TikTok boundary so server content_ids match the
    // catalog feed id + browser Pixel content_ids.
    const id = normalizeSku(it?.sku);
    if (!id) { skipped += 1; continue; }
    const quantity = Number(it.quantity) || 1;
    const price = Number(it.unit_price_usd ?? it.price ?? it.item_price);
    contents.push({
      content_id: id,
      content_type: 'product',
      quantity,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return { contents, contentIds: contents.map((c) => c.content_id), skipped };
}

// A single TikTok event envelope. Undefined optional fields are dropped.
export function buildEventPayload({
  eventName, eventId, eventTime, pageUrl, userData = {}, properties = {},
}) {
  const event = {
    event: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    user: userData,
    properties,
  };
  if (eventId) event.event_id = eventId;
  if (pageUrl) event.page = { url: pageUrl };
  return event;
}

// ── Send ──────────────────────────────────────────────────────────────────────

// POST a single event to the TikTok Events API. Resolves to a structured result
// and never rejects — callers can safely ignore the promise. Skips (no-op) when
// the access token is not configured so builds/tests don't require a secret.
export async function sendTikTokEvent({
  eventName, eventId, eventTime, pageUrl, userData, properties,
}) {
  const pixelId = getPixelId();
  const token = process.env.MINIYO_TIKTOK_ACCESS_TOKEN;
  const testCode = process.env.MINIYO_TIKTOK_TEST_EVENT_CODE;

  if (!token) {
    console.warn('[tiktokEvents] MINIYO_TIKTOK_ACCESS_TOKEN not set — skipping Events API send');
    return { ok: false, skipped: 'no_token' };
  }

  const event = buildEventPayload({ eventName, eventId, eventTime, pageUrl, userData, properties });
  const body = {
    event_source: 'web',
    event_source_id: pixelId,
    data: [event],
  };
  if (testCode) body.test_event_code = testCode;

  try {
    const resp = await fetch(TIKTOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': token,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    // TikTok returns HTTP 200 with a non-zero `code` on logical errors, so check
    // both the transport status and the API code. Never log the token or PII.
    if (!resp.ok || (json && json.code !== 0 && json.code !== undefined)) {
      console.error('[tiktokEvents] send failed', {
        event: eventName,
        status: resp.status,
        code: json?.code,
        message: json?.message,
        request_id: json?.request_id,
      });
      return { ok: false, status: resp.status, code: json?.code, error: json?.message };
    }
    console.log('[tiktokEvents] sent', {
      event: eventName,
      code: json?.code,
      request_id: json?.request_id,
    });
    return { ok: true, response: json };
  } catch (e) {
    console.error('[tiktokEvents] send error', { event: eventName, message: e?.message });
    return { ok: false, error: e?.message };
  }
}
