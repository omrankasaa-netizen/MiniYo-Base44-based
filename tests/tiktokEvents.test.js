// Tests for the server-side TikTok Events API modules:
//   - server/tiktokEventsClient.js (user hashing, contents, payload, sender)
//   - server/tiktokTrack.js (client event allowlist + properties builder)
//   - server/tiktokPurchase.js (dedup event_id, consent gating, value check)
//
// Network is always mocked — these tests never hit TikTok. Mirrors metaCapi.test.js.
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUserData, buildContents, buildEventPayload, sendTikTokEvent, getPixelId,
} from '../server/tiktokEventsClient.js';
import {
  isTrackEvent, sanitizeContents, buildTrackProperties,
} from '../server/tiktokTrack.js';
import {
  derivePurchaseEventId, buildPurchaseProperties, buildPurchaseUserData,
  purchaseConsentAllowed, isSendableValue, resolveCurrency,
} from '../server/tiktokPurchase.js';
import { sha256, normalizeEmail, normalizePhone } from '../server/metaCapiClient.js';
import { normalizeSku } from '../server/metaFeed.js';

// ── Client / hashing ──────────────────────────────────────────────────────────

test('getPixelId defaults to the public TikTok pixel id', () => {
  const prev = process.env.MINIYO_TIKTOK_PIXEL_ID;
  delete process.env.MINIYO_TIKTOK_PIXEL_ID;
  try {
    assert.equal(getPixelId(), 'D9BP18JC77U1026616UG');
  } finally {
    if (prev !== undefined) process.env.MINIYO_TIKTOK_PIXEL_ID = prev;
  }
});

test('buildUserData hashes email + phone, passes ip/ua/ttp/ttclid raw', () => {
  const user = buildUserData({
    email: 'Foo@Bar.com',
    phone: '03123456',
    clientIp: '1.2.3.4',
    userAgent: 'UA/1.0',
    ttp: 'ttp.abc',
    ttclid: 'ttclid.xyz',
  });
  assert.equal(user.email, sha256(normalizeEmail('Foo@Bar.com')));
  assert.equal(user.phone, sha256(normalizePhone('03123456')));
  // Never hashed:
  assert.equal(user.ip, '1.2.3.4');
  assert.equal(user.user_agent, 'UA/1.0');
  assert.equal(user.ttp, 'ttp.abc');
  assert.equal(user.ttclid, 'ttclid.xyz');
  // Raw PII must never appear:
  const json = JSON.stringify(user);
  assert.ok(!json.includes('foo@bar.com'));
  assert.ok(!json.includes('9613123456'));
});

test('buildUserData omits absent fields', () => {
  assert.deepEqual(buildUserData({ email: '', phone: '' }), {});
});

test('buildContents uses sku as content_id, TikTok shape, skips sku-less lines', () => {
  const { contents, contentIds, skipped } = buildContents([
    { sku: 'TONGS-5456-MULTI', quantity: 2, unit_price_usd: 18.99 },
    { sku: '', quantity: 1, unit_price_usd: 5 },
    { quantity: 1, unit_price_usd: 7 },
  ]);
  assert.equal(skipped, 2);
  assert.deepEqual(contentIds, ['TONGS-5456-MULTI']);
  assert.deepEqual(contents[0], {
    content_id: 'TONGS-5456-MULTI', content_type: 'product', quantity: 2, price: 18.99,
  });
});

test('buildContents normalizes sku to uppercase+trimmed content_ids', () => {
  const { contents, contentIds } = buildContents([
    { sku: 'moonstar-53183-Pink', quantity: 1, unit_price_usd: 5 },
    { sku: '  cgs-chb-assorted-flower ', quantity: 2, unit_price_usd: 3 },
  ]);
  assert.deepEqual(contentIds, ['MOONSTAR-53183-PINK', 'CGS-CHB-ASSORTED-FLOWER']);
  assert.equal(contents[0].content_id, 'MOONSTAR-53183-PINK');
});

test('buildEventPayload sets required fields + page url', () => {
  const ev = buildEventPayload({
    eventName: 'CompletePayment',
    eventId: 'evt-1',
    eventTime: 1700000000,
    pageUrl: 'https://miniyokids.com/checkout',
    userData: { email: 'x' },
    properties: { value: 10, currency: 'USD' },
  });
  assert.equal(ev.event, 'CompletePayment');
  assert.equal(ev.event_id, 'evt-1');
  assert.equal(ev.event_time, 1700000000);
  assert.deepEqual(ev.page, { url: 'https://miniyokids.com/checkout' });
});

// ── Track allowlist + properties ───────────────────────────────────────────────

test('isTrackEvent allows the three browser commerce events', () => {
  assert.equal(isTrackEvent('ViewContent'), true);
  assert.equal(isTrackEvent('AddToCart'), true);
  assert.equal(isTrackEvent('InitiateCheckout'), true);
});

test('isTrackEvent rejects CompletePayment (server order flow only) and unknowns', () => {
  assert.equal(isTrackEvent('CompletePayment'), false);
  assert.equal(isTrackEvent('Purchase'), false);
  assert.equal(isTrackEvent(''), false);
  assert.equal(isTrackEvent(undefined), false);
});

test('sanitizeContents normalizes ids (content_id or id) and drops id-less lines', () => {
  const out = sanitizeContents([
    { content_id: 'moonstar-53183-Pink', quantity: 2, price: 5 },
    { id: 'legacy-lower', quantity: 1, item_price: 3 },
    { quantity: 1 },
  ]);
  assert.deepEqual(out, [
    { content_id: 'MOONSTAR-53183-PINK', content_type: 'product', quantity: 2, price: 5 },
    { content_id: 'LEGACY-LOWER', content_type: 'product', quantity: 1, price: 3 },
  ]);
});

test('buildTrackProperties content_ids exactly match the feed normalizeSku', () => {
  const skus = ['moonstar-53183-Pink', '  cgs-chb-flower '];
  const props = buildTrackProperties({
    event_name: 'ViewContent',
    contents: skus.map((id) => ({ content_id: id, quantity: 1, price: 9 })),
  });
  assert.deepEqual(props.content_ids, skus.map(normalizeSku));
  assert.equal(props.content_type, 'product');
});

test('buildTrackProperties carries value + currency for commerce events', () => {
  const props = buildTrackProperties({
    event_name: 'AddToCart',
    content_ids: ['A-1'],
    contents: [{ content_id: 'A-1', quantity: 3, price: 10 }],
    value: 30,
    currency: 'usd',
  });
  assert.equal(props.value, 30);
  assert.equal(props.currency, 'USD');
  assert.deepEqual(props.contents, [
    { content_id: 'A-1', content_type: 'product', quantity: 3, price: 10 },
  ]);
});

test('buildTrackProperties falls back to content_ids when contents absent', () => {
  const props = buildTrackProperties({
    event_name: 'InitiateCheckout',
    content_ids: ['a-1', 'b-2'],
  });
  assert.deepEqual(props.content_ids, ['A-1', 'B-2']);
  assert.ok(!('contents' in props));
});

// ── Purchase (CompletePayment) builders ─────────────────────────────────────────

test('derivePurchaseEventId reuses the shared browser-sent id (dedup)', () => {
  assert.equal(derivePurchaseEventId({ meta_event_id: 'shared-123' }), 'shared-123');
});

test('derivePurchaseEventId is deterministic from order id when no shared id', () => {
  const order = { order_number: 'MNY-33492' };
  assert.equal(derivePurchaseEventId(order), 'purchase-MNY-33492');
  assert.equal(derivePurchaseEventId(order), derivePurchaseEventId(order));
});

test('resolveCurrency guards missing currency to USD', () => {
  assert.equal(resolveCurrency({}), 'USD');
  assert.equal(resolveCurrency({ currency: '' }), 'USD');
  assert.equal(resolveCurrency({ currency: 'USD' }), 'USD');
});

test('buildPurchaseProperties builds from order total + items with normalized ids', () => {
  const order = { order_number: 'MNY-1', grand_total_usd: 43.98 };
  const items = [
    { sku: 'a-1', quantity: 2, unit_price_usd: 18.99 },
    { sku: 'B-2', quantity: 1, unit_price_usd: 6 },
  ];
  const { properties, value } = buildPurchaseProperties(order, items);
  assert.equal(value, 43.98);
  assert.equal(properties.currency, 'USD');
  assert.equal(properties.content_type, 'product');
  assert.deepEqual(properties.content_ids, ['A-1', 'B-2']);
  assert.equal(properties.contents[0].content_id, 'A-1');
  assert.equal(properties.contents[0].price, 18.99);
});

test('purchaseConsentAllowed only blocks explicit false', () => {
  assert.equal(purchaseConsentAllowed({ meta_consent: false }), false);
  assert.equal(purchaseConsentAllowed({ meta_consent: true }), true);
  assert.equal(purchaseConsentAllowed({}), true);
});

test('isSendableValue requires a positive number', () => {
  assert.equal(isSendableValue(10), true);
  assert.equal(isSendableValue(0), false);
  assert.equal(isSendableValue(-1), false);
  assert.equal(isSendableValue('nan'), false);
});

test('buildPurchaseUserData maps order contact + request signals', () => {
  const user = buildPurchaseUserData(
    { customer_email: 'a@b.com', customer_phone: '03123456' },
    { clientIp: '9.9.9.9', userAgent: 'UA', ttp: 'p', ttclid: 'c' },
  );
  assert.equal(user.email, sha256('a@b.com'));
  assert.equal(user.ip, '9.9.9.9');
  assert.equal(user.ttp, 'p');
  assert.equal(user.ttclid, 'c');
});

// ── Sender no-op without a token (never hits the network) ───────────────────────

test('sendTikTokEvent no-ops (never hits the network) without an access token', async () => {
  const prev = process.env.MINIYO_TIKTOK_ACCESS_TOKEN;
  delete process.env.MINIYO_TIKTOK_ACCESS_TOKEN;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network must not be called when token is unset'); };
  try {
    const result = await sendTikTokEvent({ eventName: 'ViewContent', properties: {}, userData: {} });
    assert.deepEqual(result, { ok: false, skipped: 'no_token' });
  } finally {
    globalThis.fetch = realFetch;
    if (prev !== undefined) process.env.MINIYO_TIKTOK_ACCESS_TOKEN = prev;
  }
});

test('sendTikTokEvent posts to the Events API with Access-Token header (mocked)', async () => {
  const prevToken = process.env.MINIYO_TIKTOK_ACCESS_TOKEN;
  const prevPixel = process.env.MINIYO_TIKTOK_PIXEL_ID;
  process.env.MINIYO_TIKTOK_ACCESS_TOKEN = 'test-token';
  process.env.MINIYO_TIKTOK_PIXEL_ID = 'PIX-123';
  const realFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ code: 0, request_id: 'r1' }) };
  };
  try {
    const result = await sendTikTokEvent({
      eventName: 'CompletePayment',
      eventId: 'purchase-MNY-1',
      pageUrl: 'https://miniyokids.com/checkout',
      userData: { email: 'hash' },
      properties: { value: 20, currency: 'USD', content_ids: ['A-1'] },
    });
    assert.equal(result.ok, true);
    assert.equal(captured.url, 'https://business-api.tiktok.com/open_api/v1.3/event/track/');
    assert.equal(captured.opts.headers['Access-Token'], 'test-token');
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.event_source, 'web');
    assert.equal(body.event_source_id, 'PIX-123');
    assert.equal(body.data[0].event, 'CompletePayment');
    assert.equal(body.data[0].event_id, 'purchase-MNY-1');
    // The secret token must never leak into the request body.
    assert.ok(!captured.opts.body.includes('test-token'));
  } finally {
    globalThis.fetch = realFetch;
    if (prevToken !== undefined) process.env.MINIYO_TIKTOK_ACCESS_TOKEN = prevToken;
    else delete process.env.MINIYO_TIKTOK_ACCESS_TOKEN;
    if (prevPixel !== undefined) process.env.MINIYO_TIKTOK_PIXEL_ID = prevPixel;
    else delete process.env.MINIYO_TIKTOK_PIXEL_ID;
  }
});
