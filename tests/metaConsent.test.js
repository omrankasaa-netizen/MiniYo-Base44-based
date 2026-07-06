// Tests for src/lib/metaConsent.js — the DOM-free consent parser that gates all
// Pixel + CAPI activity. Verifies backward compatibility with the legacy
// 'granted'/'denied' string and the forward-compatible {marketing:true} object.
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStoredConsent, hasMarketingConsentValue } from '../src/lib/metaConsent.js';

test('legacy string values map to marketing boolean', () => {
  assert.deepEqual(parseStoredConsent('granted'), { marketing: true });
  assert.deepEqual(parseStoredConsent('denied'), { marketing: false });
  assert.equal(hasMarketingConsentValue('granted'), true);
  assert.equal(hasMarketingConsentValue('denied'), false);
});

test('no stored choice → null / no consent', () => {
  assert.equal(parseStoredConsent(null), null);
  assert.equal(parseStoredConsent(''), null);
  assert.equal(hasMarketingConsentValue(undefined), false);
});

test('object form honors marketing flag', () => {
  assert.equal(hasMarketingConsentValue('{"marketing":true}'), true);
  assert.equal(hasMarketingConsentValue('{"marketing":false}'), false);
  assert.equal(hasMarketingConsentValue('{"analytics":true}'), false); // marketing absent
});

test('garbage / unknown literal → no consent', () => {
  assert.equal(parseStoredConsent('maybe'), null);
  assert.equal(hasMarketingConsentValue('maybe'), false);
});
