// Unit tests for the storefront filter normalization layer
// (src/lib/filterNormalize.js). Pure functions — no DB, no network.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZE_BUCKETS,
  AGE_BUCKETS,
  GENDER_BUCKETS,
  sizeTokenToBuckets,
  productSizeBuckets,
  normalizeAge,
  genderMatchBuckets,
  availableSizeBuckets,
  availableAgeBuckets,
  availableGenderBuckets,
} from '../src/lib/filterNormalize.js';

// ── SIZE: single-token mappings ───────────────────────────────────────────────
test('sizeTokenToBuckets: single tokens map to the right bucket', () => {
  assert.deepEqual(sizeTokenToBuckets('0-1M'), ['0-3M']);
  assert.deepEqual(sizeTokenToBuckets('0-3M'), ['0-3M']);
  assert.deepEqual(sizeTokenToBuckets('1-3M'), ['0-3M']);
  assert.deepEqual(sizeTokenToBuckets('3-6M'), ['3-6M']);
  assert.deepEqual(sizeTokenToBuckets('0-6M'), ['3-6M']);
  assert.deepEqual(sizeTokenToBuckets('6-9M'), ['6-12M']);
  assert.deepEqual(sizeTokenToBuckets('9-12M'), ['6-12M']);
  assert.deepEqual(sizeTokenToBuckets('6-12M'), ['6-12M']);
  assert.deepEqual(sizeTokenToBuckets('12-18M'), ['12-24M']);
  assert.deepEqual(sizeTokenToBuckets('18-24M'), ['12-24M']);
  assert.deepEqual(sizeTokenToBuckets('12-24M'), ['12-24M']);
  assert.deepEqual(sizeTokenToBuckets('1-2Y'), ['2-3Y']);
  assert.deepEqual(sizeTokenToBuckets('2-3Y'), ['2-3Y']);
});

// ── SIZE: regression for the reported 24-36M bug ─────────────────────────────
test('sizeTokenToBuckets: 24-36M maps to its own 24-36M bucket', () => {
  assert.deepEqual(sizeTokenToBuckets('24-36M'), ['24-36M']);
});

// ── SIZE: EU cm sizes are real clothing sizes and map ────────────────────────
test('sizeTokenToBuckets: EU cm sizes map into month buckets', () => {
  assert.deepEqual(sizeTokenToBuckets('50-56'), ['0-3M']);
  assert.deepEqual(sizeTokenToBuckets('56-62'), ['3-6M']);
});

test('sizeTokenToBuckets: case-insensitive and trims whitespace', () => {
  assert.deepEqual(sizeTokenToBuckets('  3-6m '), ['3-6M']);
  assert.deepEqual(sizeTokenToBuckets('2-3y'), ['2-3Y']);
});

// ── SIZE: broad spans → every overlapping bucket ─────────────────────────────
test('sizeTokenToBuckets: broad spans expand across buckets', () => {
  assert.deepEqual(sizeTokenToBuckets('0-18M'), ['0-3M', '3-6M', '6-12M', '12-24M']);
  assert.deepEqual(sizeTokenToBuckets('NB-0m to 6-9m'), ['0-3M', '3-6M', '6-12M']);
  assert.deepEqual(sizeTokenToBuckets('0-1Y'), ['0-3M', '3-6M', '6-12M']);
});

// ── SIZE: excluded / unknown tokens ──────────────────────────────────────────
test('sizeTokenToBuckets: excludes non-clothing tokens', () => {
  for (const t of ['5-pack', '7-pack', '77x90 cm', '90x90 cm',
    '80x85+85x90 cm', 'One size', 'Assorted']) {
    assert.deepEqual(sizeTokenToBuckets(t), [], `${t} should map to nothing`);
  }
});

// ── SIZE: full live inventory coverage — no clothing token falls through ─────
// The 26 raw size tokens verified across all 95 live products. Only the 8
// non-clothing tokens may be unmatched; every clothing token MUST map somewhere.
test('sizeTokenToBuckets: no live clothing token falls through to unmatched', () => {
  const CLOTHING_TOKENS = [
    '0-1M', '0-3M', '1-3M', '0-6M', '3-6M', '6-9M', '9-12M', '6-12M',
    '12-18M', '18-24M', '12-24M', '24-36M', '1-2Y', '2-3Y', '0-1Y',
    '0-18M', 'NB-0m to 6-9m', '50-56', '56-62',
  ];
  const NON_CLOTHING_TOKENS = [
    '5-pack', '7-pack', 'One size', 'Assorted',
    '77x90 cm', '90x90 cm', '80x85+85x90 cm',
  ];
  for (const t of CLOTHING_TOKENS) {
    assert.ok(sizeTokenToBuckets(t).length > 0, `${t} must map to at least one bucket`);
    // Every produced bucket must be a real, displayable bucket.
    for (const b of sizeTokenToBuckets(t)) {
      assert.ok(SIZE_BUCKETS.includes(b), `${t} produced unknown bucket ${b}`);
    }
  }
  for (const t of NON_CLOTHING_TOKENS) {
    assert.deepEqual(sizeTokenToBuckets(t), [], `${t} must be unmatched`);
  }
  // Every one of the 6 buckets is reachable from the live clothing inventory.
  const reached = new Set();
  for (const t of CLOTHING_TOKENS) {
    for (const b of sizeTokenToBuckets(t)) reached.add(b);
  }
  assert.deepEqual([...SIZE_BUCKETS].filter(b => reached.has(b)), SIZE_BUCKETS);
});

test('sizeTokenToBuckets: unknown tokens fall back to nothing', () => {
  assert.deepEqual(sizeTokenToBuckets('banana'), []);
  assert.deepEqual(sizeTokenToBuckets(''), []);
  assert.deepEqual(sizeTokenToBuckets(null), []);
});

// ── SIZE: product-level aggregation ──────────────────────────────────────────
test('productSizeBuckets: dedupes and returns fixed display order', () => {
  // Mixed order in, canonical order out.
  assert.deepEqual(productSizeBuckets('2-3Y|0-3M|6-9M'), ['0-3M', '6-12M', '2-3Y']);
  // Two tokens mapping to the same bucket collapse to one.
  assert.deepEqual(productSizeBuckets('6-9M|9-12M'), ['6-12M']);
  // A product with only excluded tokens yields no size match.
  assert.deepEqual(productSizeBuckets('5-pack|One size|77x90 cm'), []);
  // Broad span + a normal token.
  assert.deepEqual(productSizeBuckets('0-18M'), ['0-3M', '3-6M', '6-12M', '12-24M']);
});

// ── AGE ──────────────────────────────────────────────────────────────────────
test('normalizeAge: Baby maps to Newborn; Kids dropped', () => {
  assert.equal(normalizeAge('Newborn'), 'Newborn');
  assert.equal(normalizeAge('Baby'), 'Newborn');
  assert.equal(normalizeAge('Toddler'), 'Toddler');
  assert.equal(normalizeAge('Kids'), null);
  assert.equal(normalizeAge('kids'), null);
  assert.equal(normalizeAge(''), null);
  assert.equal(normalizeAge(null), null);
});

// ── GENDER ───────────────────────────────────────────────────────────────────
test('genderMatchBuckets: Unisex surfaces under both Girls and Boys', () => {
  assert.deepEqual(genderMatchBuckets('Girls'), ['Girls']);
  assert.deepEqual(genderMatchBuckets('Boys'), ['Boys']);
  assert.deepEqual(genderMatchBuckets('Unisex'), ['Girls', 'Boys']);
  assert.deepEqual(genderMatchBuckets('unknown'), []);
  assert.deepEqual(genderMatchBuckets(null), []);
});

// ── Option-list builders: only present buckets, in fixed order ───────────────
test('availableSizeBuckets: fixed order, no ghost buckets', () => {
  const products = [
    { sizes: '2-3Y' },
    { sizes: '0-3M|6-9M' },
    { sizes: '5-pack' }, // contributes nothing
  ];
  assert.deepEqual(availableSizeBuckets(products), ['0-3M', '6-12M', '2-3Y']);
  assert.deepEqual(availableSizeBuckets([{ sizes: 'One size' }]), []);
});

test('availableAgeBuckets: only Newborn/Toddler, fixed order', () => {
  const products = [{ age_group: 'Baby' }, { age_group: 'Toddler' }, { age_group: 'Kids' }];
  assert.deepEqual(availableAgeBuckets(products), ['Newborn', 'Toddler']);
  assert.deepEqual(availableAgeBuckets([{ age_group: 'Baby' }]), ['Newborn']);
});

test('availableGenderBuckets: Girls/Boys only, fixed order', () => {
  assert.deepEqual(availableGenderBuckets([{ gender: 'Unisex' }]), ['Girls', 'Boys']);
  assert.deepEqual(availableGenderBuckets([{ gender: 'Boys' }]), ['Boys']);
  assert.deepEqual(
    availableGenderBuckets([{ gender: 'Boys' }, { gender: 'Girls' }]),
    ['Girls', 'Boys'],
  );
});

// ── Sanity on the exported orders ────────────────────────────────────────────
test('bucket orders are the canonical fixed orders', () => {
  assert.deepEqual(SIZE_BUCKETS, ['0-3M', '3-6M', '6-12M', '12-24M', '24-36M', '2-3Y']);
  assert.deepEqual(AGE_BUCKETS, ['Newborn', 'Toddler']);
  assert.deepEqual(GENDER_BUCKETS, ['Girls', 'Boys']);
});
