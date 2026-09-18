// Return-flow tests (server/orderReturns.js).
//
// Covers the COD return path ("Mark as Returned" from Out for Delivery /
// Delivered):
//   • committed order → every line restocked (qty_on_hand +=) + 'Returned' movement
//   • variant lines restock the variant row, not the product row
//   • reserved-but-never-committed order → holds dropped, on-hand untouched
//   • legacy order (neither flag) → stock untouched, status still flips
//   • wrong status (New) → 409, nothing changes
//   • idempotent: second return is a no-op (no double restock)
//
// Runs hermetically against a throwaway SQLite file — no network.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the DB at a fresh temp file BEFORE importing modules that open it.
const tmpDb = path.join(os.tmpdir(), `miniyo-returns-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { returnOrder } = await import('../server/orderReturns.js');

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const admin = db.createRecord('User', { email: 'admin@miniyo.store', role: 'admin', full_name: 'Admin' });

let seq = 0;
function uniq(p) { return `${p}-${++seq}`; }

function makeOrder({ status = 'Delivered', committed = true, reserved = false } = {}) {
  return db.createRecord('Order', {
    order_number: uniq('MNY-T'), order_status: status,
    stock_committed: committed, stock_reserved: reserved,
  });
}

function movementsFor(product_id) {
  return db.queryRecords('InventoryMovement', { query: { product_id } });
}

test('committed delivered order: lines restocked + Returned movements + status flips', () => {
  const product = db.createRecord('Product', { name: uniq('P'), has_variants: false, stock_quantity: 3, qty_reserved: 0 });
  const order = makeOrder({ status: 'Delivered', committed: true });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'P', quantity: 2 });

  const res = returnOrder({ order_id: order.id }, admin);
  assert.equal(res.ok, true);
  assert.equal(res.movements_created, 1);
  assert.equal(res.membership_untouched, true);

  const p = db.getRecord('Product', product.id);
  assert.equal(p.stock_quantity, 5); // 3 + 2 returned

  const o = db.getRecord('Order', order.id);
  assert.equal(o.order_status, 'Returned');
  assert.equal(o.stock_committed, false);
  assert.equal(o.stock_returned, true);
  assert.ok(o.returned_at);

  const mv = movementsFor(product.id);
  assert.equal(mv.length, 1);
  assert.equal(mv[0].type, 'Returned');
  assert.equal(mv[0].quantity, 2);
  assert.equal(mv[0].previous_stock, 3);
  assert.equal(mv[0].new_stock, 5);
});

test('variant line restocks the variant row', () => {
  const product = db.createRecord('Product', { name: uniq('VP'), has_variants: true });
  const variant = db.createRecord('ProductVariant', {
    product_id: product.id, size: '3-6M', color: 'White&Brown', variant_sku: uniq('SKU'), qty_on_hand: 1, qty_reserved: 0,
  });
  const order = makeOrder({ status: 'Out for Delivery', committed: true });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'VP', quantity: 1, size: '3-6M', color: 'White&Brown' });

  const res = returnOrder({ order_id: order.id }, admin);
  assert.equal(res.ok, true);
  assert.equal(db.getRecord('ProductVariant', variant.id).qty_on_hand, 2);
  const mv = movementsFor(product.id);
  assert.equal(mv[0].variant_sku, variant.variant_sku);
});

test('reserved (never committed) order: holds dropped, on-hand untouched', () => {
  const product = db.createRecord('Product', { name: uniq('P'), has_variants: false, stock_quantity: 4, qty_reserved: 1 });
  const order = makeOrder({ status: 'Out for Delivery', committed: false, reserved: true });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'P', quantity: 1 });

  const res = returnOrder({ order_id: order.id }, admin);
  assert.equal(res.ok, true);
  const p = db.getRecord('Product', product.id);
  assert.equal(p.stock_quantity, 4); // on-hand unchanged
  assert.equal(p.qty_reserved, 0); // hold dropped
  assert.equal(movementsFor(product.id)[0].type, 'Released');
});

test('legacy order (neither flag): stock untouched, status still flips', () => {
  const product = db.createRecord('Product', { name: uniq('P'), has_variants: false, stock_quantity: 7, qty_reserved: 0 });
  const order = makeOrder({ status: 'Delivered', committed: false, reserved: false });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'P', quantity: 2 });

  const res = returnOrder({ order_id: order.id }, admin);
  assert.equal(res.ok, true);
  assert.equal(res.movements_created, 0);
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 7);
  assert.equal(db.getRecord('Order', order.id).order_status, 'Returned');
});

test('wrong status → 409 and nothing changes', () => {
  const product = db.createRecord('Product', { name: uniq('P'), has_variants: false, stock_quantity: 5, qty_reserved: 0 });
  const order = makeOrder({ status: 'New', committed: false, reserved: true });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'P', quantity: 1 });

  const res = returnOrder({ order_id: order.id }, admin);
  assert.equal(res._status, 409);
  assert.match(res.error, /Out for Delivery or Delivered/);
  assert.equal(db.getRecord('Order', order.id).order_status, 'New');
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 5);
});

test('idempotent: second return is a no-op', () => {
  const product = db.createRecord('Product', { name: uniq('P'), has_variants: false, stock_quantity: 1, qty_reserved: 0 });
  const order = makeOrder({ status: 'Delivered', committed: true });
  db.createRecord('OrderItem', { order_id: order.id, product_id: product.id, product_name: 'P', quantity: 1 });

  assert.equal(returnOrder({ order_id: order.id }, admin).ok, true);
  const again = returnOrder({ order_id: order.id }, admin);
  assert.equal(again.already, true);
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 2); // restocked once, not twice
  assert.equal(movementsFor(product.id).length, 1);
});

test('missing order → 404', () => {
  const res = returnOrder({ order_id: 'nope' }, admin);
  assert.equal(res._status, 404);
});
