// Tests for src/lib/metaConsent.js — the DOM-free consent parser that gates all
// Pixel + CAPI activity. Verifies backward compatibility with the legacy
// 'granted'/'denied' string and the forward-compatible {marketing:true} object.
//
// IMPLIED CONSENT MODEL: tracking defaults to ON. hasMarketingConsentValue()
// only returns false when the visitor has EXPLICITLY declined ('denied' or
// {marketing:false}). No stored choice, garbage values, or an object with no
// 'marketing' key all count as implied consent (true).
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

test('no stored choice → implied consent (true)', () => {
  assert.equal(parseStoredConsent(null), null);
  assert.equal(parseStoredConsent(''), null);
  assert.equal(hasMarketingConsentValue(undefined), true);
  assert.equal(hasMarketingConsentValue(null), true);
  assert.equal(hasMarketingConsentValue(''), true);
});

test('object form honors explicit marketing:false only', () => {
  assert.equal(hasMarketingConsentValue('{"marketing":true}'), true);
  assert.equal(hasMarketingConsentValue('{"marketing":false}'), false);
  assert.equal(hasMarketingConsentValue('{"analytics":true}'), true); // marketing absent -> implied consent
});

test('garbage / unknown literal → implied consent (true)', () => {
  assert.equal(parseStoredConsent('maybe'), null);
  assert.equal(hasMarketingConsentValue('maybe'), true);
});
