// Gift bundle tests (server/bundles.js + the inventory engine).
//
// A bundle is a Product with is_bundle + bundle_items. It has no stock of its
// own: placing / confirming / cancelling an order for a bundle must reserve /
// sell / release each component, and a bundle is only available while every
// component is.
//
//   Run: npm test         (or: node --test tests/bundles.test.js)

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { expandBundleLines, bundleAvailableQty, decorateBundle, isBundle } from '../server/bundles.js';

const tmpDb = path.join(os.tmpdir(), `miniyo-bundle-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { invokeFunction } = await import('../server/functions.js');

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const admin = db.createRecord('User', { email: 'admin@miniyo.store', role: 'admin', full_name: 'Admin' });

let seq = 0;
const uniq = (p) => `${p}-${++seq}`;

const reserve = (order_id) => invokeFunction('inventoryEngine', { action: 'reserve_stock', order_id }, null);
const commit = (order_id) => invokeFunction('inventoryEngine', { action: 'commit_stock', order_id }, admin);
const release = (order_id) => invokeFunction('inventoryEngine', { action: 'release_stock', order_id }, admin);

const getProduct = (id) => db.getRecord('Product', id);
const findVariant = (productId, size, color) => db.queryRecords('ProductVariant', { query: { product_id: productId } })
  .find((v) => (size ? v.size === size : true) && (color ? v.color === color : true)) || null;

// Romper with sizes, simple socks, simple clip → a "Hospital Visit Box 0-3M".
function makeBundleFixture({ romper03 = 5, socks = 10, clip = 4, socksPerBox = 2 } = {}) {
  const romper = db.createRecord('Product', { name: uniq('Romper'), has_variants: true, status: 'Active', price_usd: 24 });
  const v03 = db.createRecord('ProductVariant', { product_id: romper.id, size: '0-3M', color: 'Blush', variant_sku: uniq('R03'), qty_on_hand: romper03, qty_reserved: 0 });
  const v36 = db.createRecord('ProductVariant', { product_id: romper.id, size: '3-6M', color: 'Blush', variant_sku: uniq('R36'), qty_on_hand: 50, qty_reserved: 0 });
  const sock = db.createRecord('Product', { name: uniq('Socks'), has_variants: false, status: 'Active', stock_quantity: socks, price_usd: 3.99 });
  const clipP = db.createRecord('Product', { name: uniq('Clip'), has_variants: false, status: 'Active', stock_quantity: clip, price_usd: 7.99 });
  const bundle = db.createRecord('Product', {
    name: uniq('Hospital Visit Box 0-3M'), status: 'Active', price_usd: 41, is_bundle: true, stock_quantity: 0,
    bundle_items: [
      { product_id: romper.id, quantity: 1, size: '0-3M', color: 'Blush' },
      { product_id: sock.id, quantity: socksPerBox },
      { product_id: clipP.id, quantity: 1 },
    ],
  });
  return { romper, v03, v36, sock, clip: clipP, bundle };
}

function orderFor(product, qty) {
  const order = db.createRecord('Order', { order_number: uniq('ORD'), order_status: 'New' });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: product.name, quantity: qty, unit_price_usd: product.price_usd });
  return order;
}

const avail = (id) => { const p = db.getRecord('Product', id); return (p.stock_quantity || 0) - (p.qty_reserved || 0); };
const vAvail = (id) => { const v = db.getRecord('ProductVariant', id); return (v.qty_on_hand || 0) - (v.qty_reserved || 0); };

// ── Pure helpers ──────────────────────────────────────────────────────────────
test('isBundle needs the flag and at least one item', () => {
  assert.equal(isBundle({ is_bundle: true, bundle_items: [{ product_id: 'a' }] }), true);
  assert.equal(isBundle({ is_bundle: true, bundle_items: [] }), false);
  assert.equal(isBundle({ is_bundle: false, bundle_items: [{ product_id: 'a' }] }), false);
  assert.equal(isBundle(null), false);
});

test('expandBundleLines multiplies component qty and passes normal lines through', () => {
  const products = {
    b: { id: 'b', name: 'Box', is_bundle: true, bundle_items: [{ product_id: 'x', quantity: 2, size: 'S' }, { product_id: 'y' }] },
    x: { id: 'x', name: 'X' },
    y: { id: 'y', name: 'Y' },
    n: { id: 'n', name: 'Normal' },
  };
  const lines = expandBundleLines(
    [{ product_id: 'b', quantity: 3, product_name: 'Box' }, { product_id: 'n', quantity: 1, size: 'M' }],
    (id) => products[id] || null,
  );
  assert.deepEqual(lines.map((l) => [l.product_id, l.quantity, l.size || '']), [['x', 6, 'S'], ['y', 3, ''], ['n', 1, 'M']]);
  assert.equal(lines[0].bundle_product_id, 'b');
});

test('bundle availability = fewest complete bundles the components can make', () => {
  const { bundle } = makeBundleFixture({ romper03: 5, socks: 7, clip: 4, socksPerBox: 2 });
  // romper 5, socks 7/2 = 3, clip 4 → 3
  assert.equal(bundleAvailableQty(bundle, getProduct, findVariant), 3);
  const decorated = decorateBundle(bundle, getProduct, findVariant);
  assert.equal(decorated.stock_quantity, 3);
  assert.equal(decorated.qty_reserved, 0);
  assert.equal(decorated.has_variants, false);
});

test('bundle is unavailable when a component is inactive or its variant is missing', () => {
  const { bundle, clip, romper } = makeBundleFixture();
  db.updateRecord('Product', clip.id, { status: 'Draft' });
  assert.equal(bundleAvailableQty(bundle, getProduct, findVariant), 0);
  db.updateRecord('Product', clip.id, { status: 'Active' });
  const broken = { ...bundle, bundle_items: [{ product_id: romper.id, quantity: 1, size: '9-12M' }] };
  assert.equal(bundleAvailableQty(broken, getProduct, findVariant), 0);
});

test('non-bundles are not decorated', () => {
  const p = { id: 'p', stock_quantity: 4 };
  assert.equal(decorateBundle(p, getProduct, findVariant), p);
});

// ── Inventory lifecycle ───────────────────────────────────────────────────────
test('placing a bundle order reserves every component, not the bundle', async () => {
  const { v03, v36, sock, clip, bundle } = makeBundleFixture({ romper03: 5, socks: 10, clip: 4 });
  const order = orderFor(bundle, 2);
  const res = await reserve(order.id);
  assert.equal(res.ok, true);
  assert.equal(vAvail(v03.id), 3, 'romper 0-3M: 5 − 2');
  assert.equal(vAvail(v36.id), 50, 'other sizes untouched');
  assert.equal(avail(sock.id), 6, 'socks: 10 − 2×2');
  assert.equal(avail(clip.id), 2, 'clip: 4 − 2');
  assert.equal(db.getRecord('Product', bundle.id).qty_reserved || 0, 0, 'bundle keeps no stock of its own');
  assert.equal(bundleAvailableQty(bundle, getProduct, findVariant), 2);
});

test('a bundle order is rejected when one component is short, and nothing is held', async () => {
  const { v03, sock, clip, bundle } = makeBundleFixture({ romper03: 5, socks: 10, clip: 1 });
  const order = orderFor(bundle, 2);
  const res = await reserve(order.id);
  assert.equal(res.ok, false);
  assert.equal(res._status, 409);
  assert.ok(res.shortages.some((s) => s.needed === 2));
  assert.equal(vAvail(v03.id), 5);
  assert.equal(avail(sock.id), 10);
  assert.equal(avail(clip.id), 1);
});

test('confirming then cancelling a bundle order sells, then returns, each component', async () => {
  const { v03, sock, clip, bundle } = makeBundleFixture({ romper03: 5, socks: 10, clip: 4 });
  const order = orderFor(bundle, 1);
  assert.equal((await reserve(order.id)).ok, true);
  assert.equal((await commit(order.id)).ok, true);
  assert.equal(db.getRecord('ProductVariant', v03.id).qty_on_hand, 4);
  assert.equal(db.getRecord('ProductVariant', v03.id).qty_reserved, 0);
  assert.equal(db.getRecord('Product', sock.id).stock_quantity, 8);
  assert.equal(db.getRecord('Product', clip.id).stock_quantity, 3);

  assert.equal((await release(order.id)).ok, true);
  assert.equal(db.getRecord('ProductVariant', v03.id).qty_on_hand, 5);
  assert.equal(db.getRecord('Product', sock.id).stock_quantity, 10);
  assert.equal(db.getRecord('Product', clip.id).stock_quantity, 4);
});

test('cancelling a reserved (unconfirmed) bundle order frees the holds', async () => {
  const { v03, sock, bundle } = makeBundleFixture({ romper03: 5, socks: 10, clip: 4 });
  const order = orderFor(bundle, 1);
  assert.equal((await reserve(order.id)).ok, true);
  assert.equal((await release(order.id)).ok, true);
  assert.equal(vAvail(v03.id), 5);
  assert.equal(avail(sock.id), 10);
});

test('editing an order to add a bundle keeps the bundle line and moves component stock', async () => {
  const { sock, clip, bundle } = makeBundleFixture({ romper03: 5, socks: 10, clip: 4 });
  const plain = db.createRecord('Product', { name: uniq('Hat'), has_variants: false, status: 'Active', stock_quantity: 5, price_usd: 5 });
  const order = orderFor(plain, 1);
  assert.equal((await reserve(order.id)).ok, true);

  const res = await invokeFunction('inventoryEngine', {
    action: 'edit_order_items',
    order_id: order.id,
    items: [{ product_id: plain.id, quantity: 1 }, { product_id: bundle.id, quantity: 1 }],
  }, admin);
  assert.equal(res.ok, true);

  const items = db.queryRecords('OrderItem', { query: { order_id: order.id } });
  const bundleLine = items.find((i) => i.product_id === bundle.id);
  assert.ok(bundleLine, 'order keeps the bundle as one line');
  assert.equal(bundleLine.unit_price_usd, 41, 'bundle line uses the bundle price');
  assert.equal(bundleLine.product_name, bundle.name);
  assert.equal(avail(sock.id), 8);
  assert.equal(avail(clip.id), 3);
  assert.equal(avail(plain.id), 4);
});
