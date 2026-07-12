// Tests for server/metaTrack.js — the client-originated CAPI event allowlist
// and custom_data builder (ViewContent / AddToCart / InitiateCheckout).
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { isTrackEvent, sanitizeContents, buildTrackCustomData } from '../server/metaTrack.js';
import { normalizeSku } from '../server/metaFeed.js';

test('isTrackEvent allows the three browser commerce events', () => {
  assert.equal(isTrackEvent('ViewContent'), true);
  assert.equal(isTrackEvent('AddToCart'), true);
  assert.equal(isTrackEvent('InitiateCheckout'), true);
});

test('isTrackEvent rejects Purchase (server order flow only) and unknowns', () => {
  assert.equal(isTrackEvent('Purchase'), false);
  assert.equal(isTrackEvent('PageView'), false);
  assert.equal(isTrackEvent(''), false);
  assert.equal(isTrackEvent(undefined), false);
});

test('sanitizeContents normalizes ids and drops id-less lines', () => {
  const out = sanitizeContents([
    { id: 'moonstar-53183-Pink', quantity: 2, item_price: 5 },
    { id: '', quantity: 1, item_price: 3 },
    { quantity: 1 },
  ]);
  assert.deepEqual(out, [{ id: 'MOONSTAR-53183-PINK', quantity: 2, item_price: 5 }]);
});

test('buildTrackCustomData content_ids exactly match the feed normalizeSku', () => {
  const skus = ['moonstar-53183-Pink', '  cgs-chb-flower '];
  const custom = buildTrackCustomData({
    event_name: 'ViewContent',
    contents: skus.map((id) => ({ id, quantity: 1, item_price: 9 })),
  });
  assert.deepEqual(custom.content_ids, skus.map(normalizeSku));
  assert.equal(custom.content_type, 'product');
});

test('buildTrackCustomData carries value + currency for commerce events', () => {
  const custom = buildTrackCustomData({
    event_name: 'AddToCart',
    content_ids: ['A-1'],
    contents: [{ id: 'A-1', quantity: 3, item_price: 10 }],
    value: 30,
    currency: 'usd',
    num_items: 3,
  });
  assert.equal(custom.value, 30);
  assert.equal(custom.currency, 'USD');
  assert.equal(custom.num_items, 3);
  assert.deepEqual(custom.contents, [{ id: 'A-1', quantity: 3, item_price: 10 }]);
});

test('buildTrackCustomData falls back to content_ids when contents absent', () => {
  const custom = buildTrackCustomData({
    event_name: 'InitiateCheckout',
    content_ids: ['a-1', 'b-2'],
  });
  assert.deepEqual(custom.content_ids, ['A-1', 'B-2']);
  assert.ok(!('contents' in custom));
});

test('buildTrackCustomData omits value/currency when no numeric value', () => {
  const custom = buildTrackCustomData({ event_name: 'ViewContent', content_ids: ['A-1'] });
  assert.ok(!('value' in custom));
  assert.ok(!('currency' in custom));
});
