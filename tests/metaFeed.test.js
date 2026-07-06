// Tests for server/metaFeed.js — the Meta catalog CSV feed. Verifies id==sku,
// availability mapping (incl. variant-parent behavior), sale_price logic,
// conservative gender/age mapping, and RFC-4180 CSV escaping.
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFeedCsv, buildFeedRow, csvEscape, stripHtml, mapAvailability,
  mapGender, mapAgeGroup, FEED_COLUMNS,
} from '../server/metaFeed.js';

test('csvEscape quotes fields with commas, quotes, newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape(null), '');
});

test('stripHtml removes tags and collapses whitespace', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world');
});

test('feed row id equals the sku', () => {
  const row = buildFeedRow({ sku: 'TONGS-5456-MULTI', name: 'X', price_usd: 18.99, status: 'Active', slug: 'x' });
  assert.equal(row.id, 'TONGS-5456-MULTI');
});

test('availability: Active in stock; variant-parent in stock; archived out', () => {
  assert.equal(mapAvailability({ status: 'Active', stock_quantity: 5 }), 'in stock');
  assert.equal(mapAvailability({ status: 'Active', has_variants: true, stock_quantity: 0 }), 'in stock');
  assert.equal(mapAvailability({ status: 'Active', stock_quantity: 0 }), 'out of stock');
  assert.equal(mapAvailability({ status: 'Archived', stock_quantity: 9 }), 'out of stock');
});

test('sale_price only set on a genuine discount (compare_at > price)', () => {
  const onSale = buildFeedRow({ sku: 'S1', name: 'x', price_usd: 15, compare_at_price_usd: 20, status: 'Active', slug: 's1' });
  assert.equal(onSale.price, '20.00 USD');
  assert.equal(onSale.sale_price, '15.00 USD');

  const noSale = buildFeedRow({ sku: 'S2', name: 'x', price_usd: 15, compare_at_price_usd: 10, status: 'Active', slug: 's2' });
  assert.equal(noSale.price, '15.00 USD');
  assert.equal(noSale.sale_price, '');
});

test('gender/age_group map conservatively (unknown → blank)', () => {
  assert.equal(mapGender('Boys'), 'male');
  assert.equal(mapGender('Girls'), 'female');
  assert.equal(mapGender('Unisex'), 'unisex');
  assert.equal(mapGender('Mixed?'), '');
  assert.equal(mapAgeGroup('Toddler'), 'toddler');
  assert.equal(mapAgeGroup('Baby'), 'infant');
  assert.equal(mapAgeGroup('weird'), '');
});

test('buildFeedCsv: header, one row per product, skips sku-less, escapes', () => {
  const csv = buildFeedCsv([
    { sku: 'A-1', name: 'Comma, Name', description: '<b>Soft</b>', price_usd: 18.99, status: 'Active', slug: 'a-1', image_url: 'https://img/x.webp', gender: 'Boys', age_group: 'Toddler', sizes: '6-9M|9-12M', colors: 'Red|Blue' },
    { name: 'No SKU', price_usd: 5, status: 'Active', slug: 'no-sku' }, // dropped
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], FEED_COLUMNS.join(','));
  assert.equal(lines.length, 2); // header + 1 product
  const row = lines[1];
  assert.ok(row.startsWith('A-1,'));           // id == sku
  assert.ok(row.includes('"Comma, Name"'));    // escaped
  assert.ok(row.includes('18.99 USD'));
  assert.ok(row.includes('https://img/x.webp'));
  assert.ok(row.includes('MiniYo'));           // brand default
  assert.ok(row.includes('male'));             // gender mapped
  assert.ok(row.includes('toddler'));          // age mapped
  assert.ok(row.includes(',6-9M,'));           // first size token
});
