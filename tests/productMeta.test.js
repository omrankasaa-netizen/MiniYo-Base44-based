// Tests for the server-side per-product structured data injection
// (server/productMeta.js). Verifies the OG product tags + JSON-LD emitted for a
// product, the Active/else availability mapping, and that the index.html marker
// region is replaced (removing the site-wide og:type=website default).
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(os.tmpdir(), `miniyo-productmeta-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { getProductBySlug, buildProductMetaBlock, injectProductMeta } =
  await import('../server/productMeta.js');

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const active = db.createRecord('Product', {
  sku: 'TONGS-5456-MULTI',
  name: 'Boys 2-Piece Hooded Set',
  short_description: 'Cozy hooded set',
  description: 'A warm, soft two-piece hooded set for boys.',
  price_usd: 18.99,
  currency: 'USD',
  status: 'Active',
  image_url: 'https://images.miniyokids.com/products/SKU_1.webp',
  slug: 'tongs-boys-2-piece-hooded-set-multi',
});

const soldOut = db.createRecord('Product', {
  sku: 'OOS-1',
  name: 'Sold Out Item',
  price_usd: 9.5,
  status: 'Archived',
  slug: 'sold-out-item',
});

test('getProductBySlug resolves the right product', () => {
  assert.equal(getProductBySlug('tongs-boys-2-piece-hooded-set-multi').id, active.id);
  assert.equal(getProductBySlug('does-not-exist'), null);
});

test('Active product emits the required Meta catalog microdata', () => {
  const html = buildProductMetaBlock(active);
  assert.match(html, /<meta property="og:type" content="product" \/>/);
  assert.match(html, /<meta property="product:retailer_item_id" content="TONGS-5456-MULTI" \/>/);
  assert.match(html, /<meta property="product:price:amount" content="18\.99" \/>/);
  assert.match(html, /<meta property="product:price:currency" content="USD" \/>/);
  assert.match(html, /<meta property="product:availability" content="in stock" \/>/);
  assert.match(html, /<meta property="product:brand" content="MiniYo" \/>/);
  assert.match(html, /<meta property="product:condition" content="new" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/miniyokids\.com\/product\/tongs-boys-2-piece-hooded-set-multi" \/>/);
});

test('Active product JSON-LD carries id, price, availability=InStock', () => {
  const html = buildProductMetaBlock(active);
  const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/);
  assert.ok(m, 'JSON-LD script present');
  const data = JSON.parse(m[1]);
  assert.equal(data['@type'], 'Product');
  assert.equal(data.sku, 'TONGS-5456-MULTI');
  assert.equal(data.productID, 'TONGS-5456-MULTI');
  assert.equal(data.brand.name, 'MiniYo');
  assert.equal(data.offers.price, '18.99');
  assert.equal(data.offers.priceCurrency, 'USD');
  assert.equal(data.offers.availability, 'https://schema.org/InStock');
});

test('non-Active status maps to out of stock / OutOfStock', () => {
  const html = buildProductMetaBlock(soldOut);
  assert.match(html, /<meta property="product:availability" content="out of stock" \/>/);
  const data = JSON.parse(html.match(/ld\+json">(.+?)<\/script>/)[1]);
  assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
});

test('injectProductMeta replaces the site-wide default marker region', () => {
  const template = `<head>
    <meta property="fb:app_id" content="1056890613436446" />
    <!-- MINIYO_SOCIAL_META_START -->
    <meta property="og:type" content="website" />
    <link rel="canonical" href="https://miniyokids.com/" />
    <!-- MINIYO_SOCIAL_META_END -->
    <meta name="robots" content="index, follow" />
  </head>`;
  const out = injectProductMeta(template, active);
  // Site-wide default is gone, product type + fb:app_id + robots remain.
  assert.ok(!out.includes('content="website"'));
  assert.match(out, /<meta property="og:type" content="product" \/>/);
  assert.match(out, /<meta property="fb:app_id" content="1056890613436446" \/>/);
  assert.match(out, /<meta name="robots" content="index, follow" \/>/);
  assert.ok(!out.includes('MINIYO_SOCIAL_META_START'));
});

test('attribute values are HTML-escaped (no injection breakout)', () => {
  const evil = db.createRecord('Product', {
    sku: 'X"><script>alert(1)</script>',
    name: 'Bad "Name" <x>',
    price_usd: 5,
    status: 'Active',
    slug: 'evil',
  });
  const html = buildProductMetaBlock(evil);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<SCRIPT>ALERT(1)</SCRIPT>'));
  // sku is normalized (uppercased) at the Meta boundary before escaping.
  assert.match(html, /content="X&quot;&gt;&lt;SCRIPT&gt;/);
});

test('retailer_item_id + JSON-LD id are normalized (uppercased) to match the feed', () => {
  const lower = db.createRecord('Product', {
    sku: 'moonstar-53183',
    name: 'Lowercase Sku Product',
    price_usd: 12,
    status: 'Active',
    slug: 'lowercase-sku-product',
  });
  const html = buildProductMetaBlock(lower);
  // Meta catalog matching is case-sensitive: the microdata id MUST equal the
  // feed id (normalizeSku → uppercase), never the raw stored casing.
  assert.match(html, /<meta property="product:retailer_item_id" content="MOONSTAR-53183" \/>/);
  const data = JSON.parse(html.match(/ld\+json">(.+?)<\/script>/)[1]);
  assert.equal(data.sku, 'MOONSTAR-53183');
  assert.equal(data.productID, 'MOONSTAR-53183');
});

test('sku-less product omits the catalog id microdata instead of emitting the DB id', () => {
  const noSku = db.createRecord('Product', {
    name: 'No Sku Product',
    price_usd: 7,
    status: 'Active',
    slug: 'no-sku-product',
  });
  const html = buildProductMetaBlock(noSku);
  // Absent from the feed → must not emit a phantom (DB id) catalog identifier.
  assert.ok(!html.includes('product:retailer_item_id'));
  const data = JSON.parse(html.match(/ld\+json">(.+?)<\/script>/)[1]);
  assert.equal(data.sku, undefined);
  assert.equal(data.productID, undefined);
  // The rest of the SEO/OG block is still emitted so the page is not bare.
  assert.match(html, /<meta property="og:type" content="product" \/>/);
});
