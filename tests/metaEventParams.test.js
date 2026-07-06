// Tests for src/lib/metaEventParams.js — the DOM-free builders for the Pixel
// events added alongside the existing catalog/CAPI setup (AddToWishlist,
// CompleteRegistration, Lead, Contact). Verifies content_ids use the canonical
// sku and that no raw PII leaks into the payloads.
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSku,
  contentId,
  buildAddToWishlistParams,
  buildCompleteRegistrationParams,
  buildLeadParams,
  buildContactParams,
} from '../src/lib/metaEventParams.js';

test('normalizeSku uppercases + trims and is null-safe', () => {
  assert.equal(normalizeSku('moonstar-53183-Pink'), 'MOONSTAR-53183-PINK');
  assert.equal(normalizeSku('  cgs-chb-assorted-flower  '), 'CGS-CHB-ASSORTED-FLOWER');
  assert.equal(normalizeSku(null), '');
  assert.equal(normalizeSku(undefined), '');
});

test('contentId prefers sku, falls back to id, else null — always normalized', () => {
  assert.equal(contentId({ sku: 'MNY-1', id: 'abc' }), 'MNY-1');
  assert.equal(contentId({ sku: 'moonstar-53183-Pink', id: 'abc' }), 'MOONSTAR-53183-PINK');
  assert.equal(contentId({ id: 'abc' }), 'ABC');
  assert.equal(contentId({}), null);
  assert.equal(contentId(null), null);
});

test('content_ids come out uppercase for a mixed-case sku', () => {
  const params = buildAddToWishlistParams({ sku: 'moonstar-53183-Pink', name: 'X', price_usd: 5 });
  assert.deepEqual(params.content_ids, ['MOONSTAR-53183-PINK']);
  assert.equal(params.contents[0].id, 'MOONSTAR-53183-PINK');
});

test('buildAddToWishlistParams uses sku as content_ids + numeric value', () => {
  const params = buildAddToWishlistParams({
    sku: 'MNY-TEE-01',
    id: 'internal-1',
    name: 'Soft Tee',
    price_usd: 18.99,
  });
  assert.deepEqual(params.content_ids, ['MNY-TEE-01']);
  assert.equal(params.content_type, 'product');
  assert.equal(params.content_name, 'Soft Tee');
  assert.equal(params.value, 18.99);
  assert.equal(params.currency, 'USD');
  assert.deepEqual(params.contents, [{ id: 'MNY-TEE-01', quantity: 1, item_price: 18.99 }]);
});

test('buildAddToWishlistParams coerces a missing/invalid price to 0', () => {
  const params = buildAddToWishlistParams({ sku: 'MNY-2', name: 'No Price' });
  assert.equal(params.value, 0);
  assert.equal(params.contents[0].item_price, 0);
});

test('buildAddToWishlistParams returns null when there is no usable id', () => {
  assert.equal(buildAddToWishlistParams({ name: 'Anon' }), null);
  assert.equal(buildAddToWishlistParams(null), null);
});

test('buildCompleteRegistrationParams sends standard params only (no PII)', () => {
  const params = buildCompleteRegistrationParams();
  assert.deepEqual(params, {
    content_name: 'Account Registration',
    status: true,
    currency: 'USD',
  });
  // Guard against future edits accidentally adding an email/name field.
  const json = JSON.stringify(params);
  assert.ok(!/@/.test(json));
});

test('buildLeadParams defaults to Newsletter Signup and carries no email', () => {
  assert.deepEqual(buildLeadParams(), { content_name: 'Newsletter Signup' });
  assert.deepEqual(buildLeadParams('Custom'), { content_name: 'Custom' });
});

test('buildContactParams describes the contact channel', () => {
  assert.deepEqual(buildContactParams(), { content_name: 'WhatsApp' });
  assert.deepEqual(buildContactParams('WhatsApp'), { content_name: 'WhatsApp' });
});
