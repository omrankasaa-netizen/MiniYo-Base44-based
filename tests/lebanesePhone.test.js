// Unit tests for Lebanese mobile validation (src/lib/countryCodes.js).
// Rules: 03 (Touch) = 7-digit NSN; 70/71/76/78/79 (Alfa) + 81 (Touch) =
// 8-digit NSN. Trunk 0 optional on input. Everything else fails.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLebaneseMobile, validateNationalNumber, toE164, findCountry } from '../src/lib/countryCodes.js';

const LB = findCountry('LB');

test('03 keeps its leading zero and passes (8 digits typed)', () => {
  const { ok, digits } = validateLebaneseMobile('03123456');
  assert.equal(ok, true);
  assert.equal(digits, '3123456'); // trunk 0 removed only for normalization
});

test('all valid prefixes pass', () => {
  for (const n of ['70123456', '71123456', '76123456', '78123456', '79123456', '81123456', '03123456']) {
    assert.equal(validateLebaneseMobile(n).ok, true, n);
  }
});

test('valid prefixes also pass with a leading 0 typed', () => {
  for (const n of ['070123456', '071123456', '081123456']) {
    assert.equal(validateLebaneseMobile(n).ok, true, n);
  }
});

test('83 prefix is rejected (non-existent in Lebanon)', () => {
  assert.equal(validateLebaneseMobile('83123456').ok, false);
  assert.equal(validateLebaneseMobile('083123456').ok, false);
});

test('7 digits fails, 9 digits fails', () => {
  assert.equal(validateLebaneseMobile('0312345').ok, false);   // 7 typed incl 0
  assert.equal(validateLebaneseMobile('031234567').ok, false); // 9 typed incl 0
  assert.equal(validateLebaneseMobile('7012345').ok, false);   // 7-digit NSN
  assert.equal(validateLebaneseMobile('701234567').ok, false); // 9-digit NSN
});

test('landline prefixes are rejected (courier needs mobile)', () => {
  for (const n of ['01123456', '04123456', '05123456']) {
    assert.equal(validateLebaneseMobile(n).ok, false, n);
  }
});

test('validateNationalNumber delegates to the Lebanese rules for LB', () => {
  assert.equal(validateNationalNumber(LB, '03123456').ok, true);
  assert.equal(validateNationalNumber(LB, '83123456').ok, false);
});

test('non-LB countries still use length ranges', () => {
  const US = findCountry('US');
  assert.equal(validateNationalNumber(US, '2025550123').ok, true);
  assert.equal(validateNationalNumber(US, '123').ok, false);
});

test('toE164 normalizes both forms to the same value', () => {
  assert.equal(toE164(LB, '03123456'), '+9613123456');
  assert.equal(toE164(LB, '3123456'), '+9613123456');
  assert.equal(toE164(LB, '70123456'), '+96170123456');
});

test('spaces and dashes are tolerated', () => {
  assert.equal(validateLebaneseMobile('03 123 456').ok, true);
  assert.equal(validateLebaneseMobile('70-123-456').ok, true);
});
