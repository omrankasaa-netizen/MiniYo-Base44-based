// Tests for server/tiktokFeed.js — the TikTok Catalog CSV feed. Verifies
// sku_id==sku, price is always "<amount> USD", google_product_category is never
// blank (the whole point of this feed), category/product_type mapping from the
// DB Category records, and reuse of the shared Meta escaping/availability logic.
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTiktokFeedCsv, buildTiktokFeedRow, mapGoogleCategory, buildProductType,
  TIKTOK_FEED_COLUMNS,
} from '../server/tiktokFeed.js';

const CATEGORIES = new Map([
  ['cat-apparel', { id: 'cat-apparel', name: 'Apparel' }],
  ['sub-overall', { id: 'sub-overall', name: 'Footed Overall' }],
  ['sub-socks', { id: 'sub-socks', name: '3-pair Socks' }],
]);

test('sku_id is the normalized uppercase sku; link keeps the real slug', () => {
  const row = buildTiktokFeedRow({ sku: 'moonstar-53183-Pink', name: 'X', price_usd: 5, status: 'Active', slug: 'x' });
  assert.equal(row.sku_id, 'MOONSTAR-53183-PINK');
  assert.equal(row.item_group_id, 'MOONSTAR-53183-PINK');
  assert.ok(row.link.endsWith('/product/x'));
});

test('price is always formatted with USD currency', () => {
  const row = buildTiktokFeedRow({ sku: 'A-1', name: 'X', price_usd: 18.99, status: 'Active', slug: 'a-1' });
  assert.equal(row.price, '18.99 USD');
});

test('sale_price only set on a genuine discount (compare_at > price)', () => {
  const onSale = buildTiktokFeedRow({ sku: 'S1', name: 'x', price_usd: 15, compare_at_price_usd: 20, status: 'Active', slug: 's1' });
  assert.equal(onSale.price, '20.00 USD');
  assert.equal(onSale.sale_price, '15.00 USD');

  const noSale = buildTiktokFeedRow({ sku: 'S2', name: 'x', price_usd: 15, compare_at_price_usd: 10, status: 'Active', slug: 's2' });
  assert.equal(noSale.price, '15.00 USD');
  assert.equal(noSale.sale_price, '');
});

test('availability reuses the shared Meta logic', () => {
  assert.equal(buildTiktokFeedRow({ sku: 'A', name: 'x', status: 'Active', stock_quantity: 5, slug: 'a' }).availability, 'in stock');
  assert.equal(buildTiktokFeedRow({ sku: 'B', name: 'x', status: 'Active', stock_quantity: 0, slug: 'b' }).availability, 'out of stock');
  assert.equal(buildTiktokFeedRow({ sku: 'C', name: 'x', status: 'Archived', stock_quantity: 9, slug: 'c' }).availability, 'out of stock');
});

test('mapGoogleCategory maps by keyword and never returns blank', () => {
  assert.equal(mapGoogleCategory({ subcategory: '3-pair Socks', category: 'Accessories', name: 'Cute Socks' }), 'Apparel & Accessories > Clothing > Underwear & Socks > Socks');
  assert.equal(mapGoogleCategory({ subcategory: 'Bathrobe', category: 'Basics', name: 'Hooded Bathrobe' }), 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Robes');
  assert.equal(mapGoogleCategory({ subcategory: 'Star Pajama', category: 'Sleepwear', name: 'Star Pajama' }), 'Apparel & Accessories > Clothing > Sleepwear & Loungewear');
  assert.equal(mapGoogleCategory({ subcategory: 'Swaddle', category: 'Basics', name: 'Muslin Swaddle' }), 'Baby & Toddler > Nursing & Feeding');
  assert.equal(mapGoogleCategory({ subcategory: 'Bib', category: 'Accessories', name: 'Bib' }), 'Baby & Toddler > Nursing & Feeding > Baby Bibs & Burp Cloths');
  assert.equal(mapGoogleCategory({ subcategory: 'Footed Overall', category: 'Apparel', name: 'Footed Overall' }), 'Apparel & Accessories > Clothing > Baby & Toddler Clothing');
  // Unknown → conservative baby-apparel default (never blank).
  assert.equal(mapGoogleCategory({ subcategory: '', category: '', name: 'Mystery Item' }), 'Apparel & Accessories > Clothing > Baby & Toddler Clothing');
});

test('buildProductType is a category > subcategory breadcrumb', () => {
  assert.equal(buildProductType({ category: 'Apparel', subcategory: 'Footed Overall' }), 'Apparel > Footed Overall');
  assert.equal(buildProductType({ category: 'Apparel', subcategory: '' }), 'Apparel');
  assert.equal(buildProductType({ category: '', subcategory: '' }), '');
});

test('row resolves category names from the Category map', () => {
  const row = buildTiktokFeedRow(
    { sku: 'A-1', name: 'Footed Overall', price_usd: 26.99, status: 'Active', slug: 'a-1', category_id: 'cat-apparel', subcategory_id: 'sub-overall' },
    CATEGORIES,
  );
  assert.equal(row.google_product_category, 'Apparel & Accessories > Clothing > Baby & Toddler Clothing');
  assert.equal(row.product_type, 'Apparel > Footed Overall');
});

test('buildTiktokFeedCsv: header, skips sku-less, escapes commas', () => {
  const csv = buildTiktokFeedCsv([
    { sku: 'A-1', name: 'Comma, Name', description: '<b>Soft</b>', price_usd: 18.99, status: 'Active', slug: 'a-1', image_url: 'https://img/x.webp', category_id: 'sub-socks' },
    { name: 'No SKU', price_usd: 5, status: 'Active', slug: 'no-sku' }, // dropped
  ], CATEGORIES);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], TIKTOK_FEED_COLUMNS.join(','));
  assert.equal(lines.length, 2); // header + 1 product
  const row = lines[1];
  assert.ok(row.startsWith('A-1,'));           // sku_id == sku
  assert.ok(row.includes('"Comma, Name"'));    // escaped
  assert.ok(row.includes('18.99 USD'));        // price with USD
  assert.ok(row.includes('https://img/x.webp'));
  assert.ok(row.includes('MiniYo'));           // brand default
});

// Comma-free data so a simple split reliably yields aligned columns for the
// per-row invariants TikTok cares about: price ends in USD, category non-blank.
test('every data row: price ends in USD and google_product_category is non-empty', () => {
  const csv = buildTiktokFeedCsv([
    { sku: 'A-1', name: 'Footed Overall', price_usd: 26.99, status: 'Active', slug: 'a-1', category_id: 'cat-apparel', subcategory_id: 'sub-overall' },
    { sku: 'A-2', name: 'Cute Socks', price_usd: 8.5, status: 'Active', slug: 'a-2', category_id: 'sub-socks' },
    { sku: 'A-3', name: 'Mystery Item', price_usd: 12, status: 'Active', slug: 'a-3' },
  ], CATEGORIES);
  const lines = csv.trim().split('\r\n').slice(1);
  const gpcIdx = TIKTOK_FEED_COLUMNS.indexOf('google_product_category');
  const priceIdx = TIKTOK_FEED_COLUMNS.indexOf('price');
  for (const line of lines) {
    const cells = line.split(',');
    assert.ok(cells[priceIdx].endsWith(' USD'), `price should end in USD: ${cells[priceIdx]}`);
    assert.ok(cells[gpcIdx] && cells[gpcIdx].length > 0, 'google_product_category must be non-empty');
  }
});
