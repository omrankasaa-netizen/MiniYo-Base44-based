import test from 'node:test';
import assert from 'node:assert/strict';

import {
  firstValidMetaFbc,
  isValidMetaFbc,
  mergeMetaAdvancedMatching,
} from '../src/lib/metaIdentity.js';

test('Meta fbc accepts millisecond click IDs and rejects malformed values', () => {
  assert.equal(isValidMetaFbc('fb.1.1700000000000.abc123'), true);
  assert.equal(isValidMetaFbc('fb.1.789.abc123'), false); // seconds-era timestamp
  assert.equal(isValidMetaFbc('fb.1.1700000000000.'), false);
  assert.equal(isValidMetaFbc('raw-fbclid'), false);
  assert.equal(isValidMetaFbc(null), false);
});

test('firstValidMetaFbc prefers the cookie but falls back to the browser value', () => {
  const cookie = 'fb.1.1700000000000.cookie-click';
  const browser = 'fb.1.1700000000001.browser-click';

  assert.equal(firstValidMetaFbc(cookie, browser), cookie);
  assert.equal(firstValidMetaFbc('fb.1.789.stale', browser), browser);
  assert.equal(firstValidMetaFbc(null, browser), browser);
  assert.equal(firstValidMetaFbc('', 'invalid'), undefined);
});

test('anonymous matching initialization preserves stored hashed email and phone', () => {
  const stored = {
    em: 'a'.repeat(64),
    ph: 'b'.repeat(64),
    external_id: 'c'.repeat(64),
  };
  const updates = { external_id: 'd'.repeat(64) };
  const merged = mergeMetaAdvancedMatching(stored, updates);

  assert.deepEqual(merged, {
    em: stored.em,
    ph: stored.ph,
    external_id: updates.external_id,
  });
  assert.notEqual(merged, stored);
  assert.notEqual(merged, updates);
});

test('matching merge tolerates empty or invalid inputs', () => {
  const externalId = 'e'.repeat(64);
  assert.deepEqual(mergeMetaAdvancedMatching(null, { external_id: externalId }), {
    external_id: externalId,
  });
  assert.deepEqual(mergeMetaAdvancedMatching(undefined, null), {});
});
