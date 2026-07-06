// Tests for server/metaCapiClient.js (normalization, SHA-256 hashing, payload
// building) and server/metaPurchase.js (dedup event_id reuse, consent gating,
// value validation, custom_data from order + items).
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  normalizeEmail, normalizePhone, sha256, buildUserData, buildContents,
  buildEventPayload,
} from '../server/metaCapiClient.js';
import {
  derivePurchaseEventId, buildPurchaseCustomData, buildPurchaseUserData,
  purchaseConsentAllowed, isSendableValue, resolveCurrency,
} from '../server/metaPurchase.js';

test('normalizeEmail lowercases + trims', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
});

test('normalizePhone yields E.164 digits (Lebanon default)', () => {
  assert.equal(normalizePhone('03 123 456'), '9613123456');
  assert.equal(normalizePhone('+961 3 123456'), '9613123456');
  assert.equal(normalizePhone('00961 3 123456'), '9613123456');
  assert.equal(normalizePhone(''), '');
});

test('normalizePhone keeps an existing 961 country code', () => {
  assert.equal(normalizePhone('9613123456'), '9613123456');
});

test('sha256 matches node crypto and is used for email/phone', () => {
  const email = 'foo@bar.com';
  const expected = crypto.createHash('sha256').update(email).digest('hex');
  assert.equal(sha256(email), expected);
});

test('buildUserData hashes email + phone, passes ip/ua/fbp/fbc raw', () => {
  const ud = buildUserData({
    email: 'Foo@Bar.com',
    phone: '03123456',
    clientIp: '1.2.3.4',
    userAgent: 'UA/1.0',
    fbp: 'fb.1.123.456',
    fbc: 'fb.1.789.abc',
  });
  assert.equal(ud.em[0], sha256('foo@bar.com'));
  assert.equal(ud.ph[0], sha256('9613123456'));
  // Never hashed:
  assert.equal(ud.client_ip_address, '1.2.3.4');
  assert.equal(ud.client_user_agent, 'UA/1.0');
  assert.equal(ud.fbp, 'fb.1.123.456');
  assert.equal(ud.fbc, 'fb.1.789.abc');
  // Raw PII must never appear:
  const json = JSON.stringify(ud);
  assert.ok(!json.includes('foo@bar.com'));
  assert.ok(!json.includes('9613123456'));
});

test('buildUserData omits absent fields', () => {
  const ud = buildUserData({ email: '', phone: '' });
  assert.deepEqual(ud, {});
});

test('buildContents uses sku as id and skips sku-less lines', () => {
  const { contents, contentIds, skipped } = buildContents([
    { sku: 'TONGS-5456-MULTI', quantity: 2, unit_price_usd: 18.99 },
    { sku: '', quantity: 1, unit_price_usd: 5 },
    { quantity: 1, unit_price_usd: 7 },
  ]);
  assert.equal(skipped, 2);
  assert.deepEqual(contentIds, ['TONGS-5456-MULTI']);
  assert.deepEqual(contents[0], { id: 'TONGS-5456-MULTI', quantity: 2, item_price: 18.99 });
});

test('buildContents normalizes sku to uppercase+trimmed content_ids', () => {
  const { contents, contentIds } = buildContents([
    { sku: 'moonstar-53183-Pink', quantity: 1, unit_price_usd: 5 },
    { sku: '  cgs-chb-assorted-flower ', quantity: 2, unit_price_usd: 3 },
  ]);
  assert.deepEqual(contentIds, ['MOONSTAR-53183-PINK', 'CGS-CHB-ASSORTED-FLOWER']);
  assert.equal(contents[0].id, 'MOONSTAR-53183-PINK');
});

test('buildEventPayload sets required fields + defaults action_source', () => {
  const ev = buildEventPayload({
    eventName: 'Purchase',
    eventId: 'evt-1',
    eventTime: 1700000000,
    userData: { em: ['x'] },
    customData: { value: 10, currency: 'USD' },
  });
  assert.equal(ev.event_name, 'Purchase');
  assert.equal(ev.event_id, 'evt-1');
  assert.equal(ev.event_time, 1700000000);
  assert.equal(ev.action_source, 'website');
});

test('derivePurchaseEventId reuses the browser-sent id (dedup)', () => {
  assert.equal(derivePurchaseEventId({ meta_event_id: 'shared-123' }), 'shared-123');
});

test('derivePurchaseEventId is deterministic when no id stored (retry dedup)', () => {
  const order = { order_number: 'MNY-33492' };
  assert.equal(derivePurchaseEventId(order), 'purchase-MNY-33492');
  assert.equal(derivePurchaseEventId(order), derivePurchaseEventId(order));
});

test('resolveCurrency guards missing currency to USD', () => {
  assert.equal(resolveCurrency({}), 'USD');
  assert.equal(resolveCurrency({ currency: '' }), 'USD');
  assert.equal(resolveCurrency({ currency: 'USD' }), 'USD');
});

test('buildPurchaseCustomData builds from order total + items', () => {
  const order = { order_number: 'MNY-1', grand_total_usd: 43.98 };
  const items = [
    { sku: 'A-1', quantity: 2, unit_price_usd: 18.99 },
    { sku: 'B-2', quantity: 1, unit_price_usd: 6 },
  ];
  const { customData, value } = buildPurchaseCustomData(order, items);
  assert.equal(value, 43.98);
  assert.equal(customData.currency, 'USD');
  assert.equal(customData.content_type, 'product');
  assert.deepEqual(customData.content_ids, ['A-1', 'B-2']);
  assert.equal(customData.order_id, 'MNY-1');
  assert.equal(customData.num_items, 3);
});

test('purchaseConsentAllowed only blocks explicit false', () => {
  assert.equal(purchaseConsentAllowed({ meta_consent: false }), false);
  assert.equal(purchaseConsentAllowed({ meta_consent: true }), true);
  assert.equal(purchaseConsentAllowed({}), true); // absent → allowed
});

test('isSendableValue requires a positive number', () => {
  assert.equal(isSendableValue(10), true);
  assert.equal(isSendableValue(0), false);
  assert.equal(isSendableValue(-1), false);
  assert.equal(isSendableValue('nan'), false);
});

test('buildPurchaseUserData maps order contact + request signals', () => {
  const ud = buildPurchaseUserData(
    { customer_email: 'a@b.com', customer_phone: '03123456' },
    { clientIp: '9.9.9.9', userAgent: 'UA', fbp: 'p', fbc: 'c' },
  );
  assert.equal(ud.em[0], sha256('a@b.com'));
  assert.equal(ud.client_ip_address, '9.9.9.9');
  assert.equal(ud.fbp, 'p');
});
