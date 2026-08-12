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
import { normalizeSku } from './metaFeed.js';

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

// Normalize free-text PII per Meta's spec before hashing: lowercase, trim,
// strip all punctuation/whitespace runs (names, city, state).
function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// dateOfBirth must be YYYYMMDD; gender is 'm'/'f'.
function normalizeDob(value) {
  const c = String(value || '').replace(/\D/g, '');
  return c.length === 8 ? c : '';
}

function normalizeGender(value) {
  const c = String(value || '').trim().toLowerCase().charAt(0);
  return c === 'm' || c === 'f' ? c : '';
}

// Build Meta `user_data`. em/ph/fn/ln/ct/st/zp/country/ge/db are SHA-256
// hashed after normalization; ip/ua/fbp/fbc are sent raw as Meta expects.
// Returns only the keys that have values.
export function buildUserData({ email, phone, firstName, lastName, city, state, zip, country, gender, dateOfBirth, clientIp, userAgent, fbp, fbc } = {}) {
  const em = hashOrUndefined(normalizeEmail(email));
  const ph = hashOrUndefined(normalizePhone(phone));
  const fn = hashOrUndefined(normalizeText(firstName));
  const ln = hashOrUndefined(normalizeText(lastName));
  const ct = hashOrUndefined(normalizeText(city));
  const st = hashOrUndefined(normalizeText(state));
  const zp = hashOrUndefined(normalizeText(zip));
  const ctr = hashOrUndefined(normalizeText(country));
  const ge = hashOrUndefined(normalizeGender(gender));
  const db = hashOrUndefined(normalizeDob(dateOfBirth));
  const data = {};
  if (em) data.em = [em];
  if (ph) data.ph = [ph];
  if (fn) data.fn = [fn];
  if (ln) data.ln = [ln];
  if (ct) data.ct = [ct];
  if (st) data.st = [st];
  if (zp) data.zp = [zp];
  if (ctr) data.country = [ctr];
  if (ge) data.ge = [ge];
  if (db) data.db = [db];
  if (clientIp) data.client_ip_address = clientIp;
  if (userAgent) data.client_user_agent = userAgent;
  if (fbp) data.fbp = fbp;
  // fbc must be fb.1.{creationTime_ms}.{fbclid}. A seconds-era creation time
  // (legacy cookie bug, ~10 digits) makes Meta flag "invalid creationTime" and
  // can hurt attribution — drop malformed values rather than send them.
  if (fbc && /^fb\.1\.\d{13,}\..+/.test(String(fbc))) data.fbc = fbc;
  return data;
}

// Merge CLIENT-PRE-HASHED identity fields into a server-built user_data object.
// Used by /api/meta/track: the browser can only offer SHA-256 hashes it
// persisted from a previous checkout (raw PII is never accepted from the
// client). Only well-formed 64-char lowercase-hex values under an allowlist of
// keys are merged, as single-element arrays like buildUserData produces.
const CLIENT_HASHED_KEYS = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'ge', 'db'];
export function mergeClientHashedUserData(userData, clientHashed) {
  const out = { ...(userData || {}) };
  if (!clientHashed || typeof clientHashed !== 'object') return out;
  for (const k of CLIENT_HASHED_KEYS) {
    const v = clientHashed[k];
    if (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) && !out[k]) out[k] = [v];
  }
  return out;
}

// ── Content / custom_data helpers ───────────────────────────────────────────

// Normalize order/cart lines to Meta `contents`. Uses sku as the id and skips
// any line missing a sku (never emits undefined ids). Returns { contents,
// contentIds, skipped } where skipped counts dropped (sku-less) lines.
export function buildContents(items = []) {
  const contents = [];
  let skipped = 0;
  for (const it of items) {
    // Normalize the OrderItem sku at the Meta boundary so server Purchase
    // content_ids match the catalog feed id + browser Pixel content_ids.
    const id = normalizeSku(it?.sku);
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

  // DEBUG: set META_DEBUG=true to verify outgoing event_time values in Test Events.
  if (process.env.META_DEBUG === 'true') {
    console.log('[metaCapi:DEBUG]', {
      event_name: event.event_name,
      event_time: event.event_time,
      event_time_utc: new Date(event.event_time * 1000).toISOString(),
      fbc_attached: !!userData?.fbc,
      event_id: eventId ?? null,
    });
  }

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
