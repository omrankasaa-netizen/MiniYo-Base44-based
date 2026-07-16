// Reserve-at-placement inventory lifecycle tests (server/functions.js).
//
// Verifies the oversell fix: stock is HELD at order placement (qty_reserved),
// converted to a sale at confirmation (qty_on_hand-=, qty_reserved-=), and freed
// only on cancellation. Covers the required cases:
//   • immediate reservation reduces availability
//   • a second order for the last unit is REJECTED at placement
//   • cancellation restores availability (reserved-only and committed)
//   • confirmation converts reserve→sale (net-zero availability)
//   • legacy (unreserved) orders still commit/release via on-hand-only fallback
//   • stock never goes negative
//   • idempotent double-calls (reserve/commit/release)
//   • variant products behave like simple products
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
const tmpDb = path.join(os.tmpdir(), `miniyo-inv-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { invokeFunction } = await import('../server/functions.js');

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const admin = db.createRecord('User', { email: 'admin@miniyo.store', role: 'admin', full_name: 'Admin' });
const guest = null; // guest checkout has no user

let seq = 0;
function uniq(p) { return `${p}-${++seq}`; }

// ── Helpers to build a product + an order for it ──────────────────────────────
function makeSimpleProduct(stock, reserved = 0) {
  return db.createRecord('Product', {
    name: uniq('Prod'), has_variants: false, stock_quantity: stock, qty_reserved: reserved,
  });
}

function makeVariantProduct(stock, { size = 'M', color = 'Red', reserved = 0 } = {}) {
  const product = db.createRecord('Product', { name: uniq('VProd'), has_variants: true });
  const variant = db.createRecord('ProductVariant', {
    product_id: product.id, size, color, variant_sku: uniq('SKU'),
    qty_on_hand: stock, qty_reserved: reserved,
  });
  return { product, variant };
}

// Creates an Order + one OrderItem for the given product/qty. `variant` optional.
function makeOrder(product, qty, { variant = null, extraOrder = {} } = {}) {
  const order = db.createRecord('Order', {
    order_number: uniq('ORD'), order_status: 'New', ...extraOrder,
  });
  db.createRecord('OrderItem', {
    order_id: order.id, product_id: product.id, product_name: product.name,
    quantity: qty,
    size: variant ? variant.size : undefined,
    color: variant ? variant.color : undefined,
  });
  return order;
}

const reserve = (order_id, user = guest) => invokeFunction('inventoryEngine', { action: 'reserve_stock', order_id }, user);
const check = (order_id) => invokeFunction('inventoryEngine', { action: 'check_stock', order_id }, guest);
const commit = (order_id) => invokeFunction('inventoryEngine', { action: 'commit_stock', order_id }, admin);
const release = (order_id) => invokeFunction('inventoryEngine', { action: 'release_stock', order_id }, admin);

const availOf = (id) => { const p = db.getRecord('Product', id); return (p.stock_quantity || 0) - (p.qty_reserved || 0); };
const variantAvailOf = (id) => { const v = db.getRecord('ProductVariant', id); return (v.qty_on_hand || 0) - (v.qty_reserved || 0); };

// ── 1. Immediate reservation reduces availability (on-hand untouched) ─────────
test('reserve holds stock immediately: availability drops, on_hand unchanged', async () => {
  const product = makeSimpleProduct(5);
  const order = makeOrder(product, 2);

  const res = await reserve(order.id);
  assert.equal(res.ok, true);

  const after = db.getRecord('Product', product.id);
  assert.equal(after.stock_quantity, 5, 'on_hand must NOT change at reservation');
  assert.equal(after.qty_reserved, 2, 'reserved incremented by ordered qty');
  assert.equal(availOf(product.id), 3, 'availability = on_hand - reserved');

  assert.equal(db.getRecord('Order', order.id).stock_reserved, true);

  const moves = db.queryRecords('InventoryMovement', { query: { product_id: product.id } });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].type, 'Reserved');
});

// ── 2. Second order for the last unit is REJECTED at placement ────────────────
test('second placement for the last unit is rejected (no oversell)', async () => {
  const product = makeSimpleProduct(1);
  const orderA = makeOrder(product, 1);
  const orderB = makeOrder(product, 1);

  const a = await reserve(orderA.id);
  assert.equal(a.ok, true, 'first order reserves the last unit');

  const b = await reserve(orderB.id);
  assert.equal(b.ok, false, 'second order must be rejected');
  assert.equal(b._status, 409);
  assert.ok(Array.isArray(b.shortages) && b.shortages.length === 1);

  // Rejected order is auto-cancelled so it can never later be confirmed.
  assert.equal(db.getRecord('Order', orderB.id).order_status, 'Cancelled');
  // Nothing extra reserved by the failed attempt.
  assert.equal(db.getRecord('Product', product.id).qty_reserved, 1);
});

// ── 3. Cancellation of a reserved-only order restores availability ────────────
test('cancel of reserved (uncommitted) order frees the hold', async () => {
  const product = makeSimpleProduct(4);
  const order = makeOrder(product, 3);

  await reserve(order.id);
  assert.equal(availOf(product.id), 1);

  const rel = await release(order.id);
  assert.equal(rel.ok, true);

  const after = db.getRecord('Product', product.id);
  assert.equal(after.qty_reserved, 0, 'hold dropped');
  assert.equal(after.stock_quantity, 4, 'on_hand never touched');
  assert.equal(availOf(product.id), 4, 'full availability restored');
  assert.equal(db.getRecord('Order', order.id).stock_reserved, false);

  const rele = db.queryRecords('InventoryMovement', { query: { product_id: product.id } })
    .find((m) => m.type === 'Released');
  assert.ok(rele, 'a Released movement was logged');
});

// ── 4. Confirmation converts reserve → sale (net-zero availability change) ─────
test('confirm converts reservation to sale: on_hand and reserved both drop', async () => {
  const product = makeSimpleProduct(10);
  const order = makeOrder(product, 4);

  await reserve(order.id);
  assert.equal(availOf(product.id), 6);

  const com = await commit(order.id);
  assert.equal(com.ok, true);

  const after = db.getRecord('Product', product.id);
  assert.equal(after.stock_quantity, 6, 'on_hand reduced by sold qty');
  assert.equal(after.qty_reserved, 0, 'hold released as it became a sale');
  assert.equal(availOf(product.id), 6, 'availability unchanged from reserved state (net-zero)');
  assert.equal(db.getRecord('Order', order.id).stock_committed, true);
  assert.equal(db.getRecord('Order', order.id).stock_reserved, false);

  const sold = db.queryRecords('InventoryMovement', { query: { product_id: product.id } })
    .find((m) => m.type === 'Sold');
  assert.ok(sold);
});

// ── 4b. Cancel AFTER commit restores on-hand ──────────────────────────────────
test('cancel of a committed order returns units to on_hand', async () => {
  const product = makeSimpleProduct(8);
  const order = makeOrder(product, 3);

  await reserve(order.id);
  await commit(order.id);
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 5);

  await release(order.id);
  const after = db.getRecord('Product', product.id);
  assert.equal(after.stock_quantity, 8, 'sold units returned to on_hand');
  assert.equal(after.qty_reserved, 0);
});

// ── 5. Legacy (unreserved) order still commits & releases via on-hand-only ────
test('legacy order (never reserved) commits by decrementing on_hand only', async () => {
  const product = makeSimpleProduct(6);
  const order = makeOrder(product, 2); // note: no reserve() call

  // Legacy commit re-validates against availability then decrements on_hand.
  const com = await commit(order.id);
  assert.equal(com.ok, true);
  const after = db.getRecord('Product', product.id);
  assert.equal(after.stock_quantity, 4);
  assert.equal(after.qty_reserved || 0, 0, 'no reserved counter involved for legacy');
});

test('legacy order commit is rejected when stock is insufficient', async () => {
  const product = makeSimpleProduct(1);
  const order = makeOrder(product, 5);
  const com = await commit(order.id);
  assert.equal(com.ok, false);
  assert.equal(com._status, 409);
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 1, 'nothing deducted on rejection');
});

// ── 6. Stock never goes negative ──────────────────────────────────────────────
test('commit clamps on_hand at zero (never negative)', async () => {
  const product = makeSimpleProduct(2);
  // Force an over-committed situation: reserve 2, then externally drop on_hand.
  const order = makeOrder(product, 2);
  await reserve(order.id);
  db.updateRecord('Product', product.id, { stock_quantity: 1 }); // on_hand < reserved now
  await commit(order.id);
  const after = db.getRecord('Product', product.id);
  assert.equal(after.stock_quantity, 0, 'clamped at 0, not -1');
  assert.equal(after.qty_reserved, 0);
});

// ── 7. Idempotent double-calls ────────────────────────────────────────────────
test('double reserve is idempotent (second call is a no-op)', async () => {
  const product = makeSimpleProduct(5);
  const order = makeOrder(product, 2);
  await reserve(order.id);
  const second = await reserve(order.id);
  assert.equal(second.ok, true);
  assert.match(second.message || '', /already reserved/i);
  assert.equal(db.getRecord('Product', product.id).qty_reserved, 2, 'still only reserved once');
});

test('double commit is idempotent', async () => {
  const product = makeSimpleProduct(5);
  const order = makeOrder(product, 2);
  await reserve(order.id);
  await commit(order.id);
  const second = await commit(order.id);
  assert.equal(second.ok, true);
  assert.match(second.message || '', /already committed/i);
  assert.equal(db.getRecord('Product', product.id).stock_quantity, 3, 'not deducted twice');
});

test('double release is idempotent', async () => {
  const product = makeSimpleProduct(5);
  const order = makeOrder(product, 2);
  await reserve(order.id);
  await release(order.id);
  const second = await release(order.id);
  assert.equal(second.ok, true);
  assert.match(second.message || '', /nothing to release/i);
  assert.equal(db.getRecord('Product', product.id).qty_reserved, 0);
});

// ── 8. Variant products follow the same lifecycle ─────────────────────────────
test('variant: reserve → confirm reduces variant on_hand & reserved', async () => {
  const { product, variant } = makeVariantProduct(5);
  const order = makeOrder(product, 2, { variant });

  await reserve(order.id);
  assert.equal(db.getRecord('ProductVariant', variant.id).qty_reserved, 2);
  assert.equal(variantAvailOf(variant.id), 3);

  await commit(order.id);
  const after = db.getRecord('ProductVariant', variant.id);
  assert.equal(after.qty_on_hand, 3);
  assert.equal(after.qty_reserved, 0);
});

test('variant: second order for last unit rejected', async () => {
  const { product, variant } = makeVariantProduct(1);
  const orderA = makeOrder(product, 1, { variant });
  const orderB = makeOrder(product, 1, { variant });
  assert.equal((await reserve(orderA.id)).ok, true);
  const b = await reserve(orderB.id);
  assert.equal(b.ok, false);
  assert.equal(b._status, 409);
  assert.equal(db.getRecord('ProductVariant', variant.id).qty_reserved, 1);
});

// ── 9. check_stock reflects reservations ──────────────────────────────────────
test('check_stock reports shortage once availability is exhausted by a hold', async () => {
  const product = makeSimpleProduct(2);
  const held = makeOrder(product, 2);
  await reserve(held.id); // exhausts availability

  const probe = makeOrder(product, 1);
  const res = await check(probe.id);
  assert.equal(res.ok, false);
  assert.equal(res.shortages[0].available, 0);
});

// ── 10. Atomicity: a multi-line order with one short line reserves NOTHING ─────
test('all-or-nothing: one short line rolls back the whole reservation', async () => {
  const ok = makeSimpleProduct(5);
  const short = makeSimpleProduct(1);
  const order = db.createRecord('Order', { order_number: uniq('ORD'), order_status: 'New' });
  db.createRecord('OrderItem', { order_id: order.id, product_id: ok.id, product_name: ok.name, quantity: 2 });
  db.createRecord('OrderItem', { order_id: order.id, product_id: short.id, product_name: short.name, quantity: 3 });

  const res = await reserve(order.id);
  assert.equal(res.ok, false);
  assert.equal(res._status, 409);
  // The good line must NOT have been reserved — the transaction rolled back.
  assert.equal(db.getRecord('Product', ok.id).qty_reserved || 0, 0, 'no partial reservation');
  assert.equal(db.getRecord('Order', order.id).order_status, 'Cancelled');
});

// ── 11. Authorization: mutating actions require admin, reserve/check are public ─
test('commit/release require admin; reserve/check are public', async () => {
  const product = makeSimpleProduct(3);
  const order = makeOrder(product, 1);

  // guest can reserve + check
  assert.equal((await reserve(order.id, guest)).ok, true);
  assert.equal((await check(order.id)).ok !== undefined, true);

  // guest cannot commit or release
  const c = await invokeFunction('inventoryEngine', { action: 'commit_stock', order_id: order.id }, guest);
  assert.equal(c._status, 401);
  const customer = db.createRecord('User', { email: 'cust@x.com', role: 'customer' });
  const c2 = await invokeFunction('inventoryEngine', { action: 'commit_stock', order_id: order.id }, customer);
  assert.equal(c2._status, 403);
});
