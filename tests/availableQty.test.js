// Unit tests for the shared storefront availability helper
// (src/lib/availableQty.js, re-exported from src/lib/inventory.js).
// Pure functions — no DB, no network.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { availableQty, productAvailableQty } from '../src/lib/availableQty.js';

test('availableQty: on-hand minus reserved (simple product)', () => {
  assert.equal(availableQty({ stock_quantity: 5, qty_reserved: 2 }), 3);
  assert.equal(availableQty({ stock_quantity: 1, qty_reserved: 1 }), 0);
  assert.equal(availableQty({ stock_quantity: 10 }), 10); // reserved missing → 0
});

test('availableQty: variant uses qty_on_hand, then stock_quantity', () => {
  assert.equal(availableQty({ qty_on_hand: 8, qty_reserved: 3 }), 5);
  // qty_on_hand takes precedence over stock_quantity when both present
  assert.equal(availableQty({ qty_on_hand: 4, stock_quantity: 99, qty_reserved: 1 }), 3);
});

test('availableQty: missing / null input → 0', () => {
  assert.equal(availableQty(undefined), 0);
  assert.equal(availableQty(null), 0);
  assert.equal(availableQty({}), 0);
});

test('availableQty: never negative when reserved exceeds on-hand', () => {
  assert.equal(availableQty({ stock_quantity: 2, qty_reserved: 5 }), 0);
  assert.equal(availableQty({ qty_on_hand: 0, qty_reserved: 3 }), 0);
});

test('availableQty: honors explicit zeros', () => {
  assert.equal(availableQty({ qty_on_hand: 0, qty_reserved: 0 }), 0);
  assert.equal(availableQty({ stock_quantity: 0 }), 0);
});

test('productAvailableQty: variant product = sum of variant availables', () => {
  const product = { has_variants: true };
  const variants = [
    { qty_on_hand: 5, qty_reserved: 2 }, // 3
    { qty_on_hand: 4, qty_reserved: 4 }, // 0
    { qty_on_hand: 2, qty_reserved: 0 }, // 2
  ];
  assert.equal(productAvailableQty(product, variants), 5);
});

test('productAvailableQty: variant product is out of stock only when ALL variants unavailable', () => {
  const product = { has_variants: true };
  const allReserved = [
    { qty_on_hand: 3, qty_reserved: 3 },
    { qty_on_hand: 1, qty_reserved: 5 },
  ];
  assert.equal(productAvailableQty(product, allReserved), 0);

  const oneLeft = [
    { qty_on_hand: 3, qty_reserved: 3 },
    { qty_on_hand: 1, qty_reserved: 0 },
  ];
  assert.equal(productAvailableQty(product, oneLeft), 1);
});

test('productAvailableQty: simple product falls back to its own availability', () => {
  assert.equal(productAvailableQty({ has_variants: false, stock_quantity: 6, qty_reserved: 1 }), 5);
  // has_variants but no variant rows supplied → product-level fallback
  assert.equal(productAvailableQty({ has_variants: true, stock_quantity: 4, qty_reserved: 1 }, []), 3);
  assert.equal(productAvailableQty({ has_variants: true, stock_quantity: 4, qty_reserved: 1 }), 3);
});

test('productAvailableQty: null product → 0', () => {
  assert.equal(productAvailableQty(null), 0);
  assert.equal(productAvailableQty(undefined, []), 0);
});
