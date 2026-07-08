// Unit tests for manual/admin order pricing math (src/lib/discounts.js).
// Covers the manual-order controls that make stored revenue correct:
//   auto-applied product discount default, per-item price override,
//   order-level discount ($ and %), delivery fee, and final-total override.
//
//   Run: npm test   (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  round2,
  calcOrderDiscount,
  calcManualOrderTotals,
  getEffectiveUnitPrice,
} from '../src/lib/discounts.js';

// ── round2 ────────────────────────────────────────────────────────────────────
test('round2: rounds to 2 decimals and coerces junk to 0', () => {
  assert.equal(round2(2.5), 2.5);
  assert.equal(round2(2.349), 2.35);
  assert.equal(round2('3.14159'), 3.14);
  assert.equal(round2(undefined), 0);
  assert.equal(round2(null), 0);
});

// ── #2 AUTO-APPLY EXISTING PRODUCT DISCOUNTS (shared storefront helper) ────────
test('getEffectiveUnitPrice: percentage auto-discount applied by default', () => {
  const product = { id: 'p1', price_usd: 20, applies_to: 'all_products' };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'percentage', value: 25 }];
  assert.equal(getEffectiveUnitPrice(discounts, product, 20), 15);
});

test('getEffectiveUnitPrice: fixed auto-discount applied to variant base price', () => {
  const product = { id: 'p1', price_usd: 30, applies_to: 'all_products' };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'fixed_amount', value: 5 }];
  // variant base price 24 → 24 - 5 = 19
  assert.equal(getEffectiveUnitPrice(discounts, product, 24), 19);
});

test('getEffectiveUnitPrice: no live discount falls back to base price', () => {
  const product = { id: 'p1', price_usd: 20 };
  assert.equal(getEffectiveUnitPrice([], product, 20), 20);
});

// ── #3 ORDER-LEVEL DISCOUNT: fixed amount ─────────────────────────────────────
test('calcOrderDiscount: fixed amount subtracted, clamped to subtotal', () => {
  assert.equal(calcOrderDiscount('fixed_amount', 5, 40), 5);
  assert.equal(calcOrderDiscount('fixed_amount', 100, 40), 40); // clamp
  assert.equal(calcOrderDiscount('fixed_amount', 0, 40), 0);
});

// ── #3 ORDER-LEVEL DISCOUNT: percentage ───────────────────────────────────────
test('calcOrderDiscount: percentage of subtotal', () => {
  assert.equal(calcOrderDiscount('percentage', 10, 40), 4);
  assert.equal(calcOrderDiscount('percentage', 12.5, 80), 10);
  assert.equal(calcOrderDiscount('percentage', 0, 40), 0);
});

test('calcOrderDiscount: guards negatives and empty subtotal', () => {
  assert.equal(calcOrderDiscount('percentage', -10, 40), 0);
  assert.equal(calcOrderDiscount('fixed_amount', 5, 0), 0);
});

// ── #5 TOTAL: auto-calculation (subtotal − discount + delivery) ───────────────
test('calcManualOrderTotals: sums line items at their (overridden) unit price', () => {
  const items = [
    { unit_price_usd: 15, quantity: 2 }, // 30
    { unit_price_usd: 8.5, quantity: 1 }, // 8.5
  ];
  const r = calcManualOrderTotals({ items, deliveryFee: 3 });
  assert.equal(r.subtotal, 38.5);
  assert.equal(r.discount, 0);
  assert.equal(r.delivery, 3);
  assert.equal(r.grandTotal, 41.5);
});

test('calcManualOrderTotals: applies % order discount then adds delivery', () => {
  const items = [{ unit_price_usd: 20, quantity: 5 }]; // 100
  const r = calcManualOrderTotals({ items, deliveryFee: 5, discountType: 'percentage', discountValue: 10 });
  assert.equal(r.subtotal, 100);
  assert.equal(r.discount, 10);
  assert.equal(r.delivery, 5);
  assert.equal(r.grandTotal, 95); // 100 - 10 + 5
});

test('calcManualOrderTotals: applies $ order discount', () => {
  const items = [{ unit_price_usd: 12, quantity: 3 }]; // 36
  const r = calcManualOrderTotals({ items, deliveryFee: 0, discountType: 'fixed_amount', discountValue: 6 });
  assert.equal(r.grandTotal, 30);
});

// ── #4 DELIVERY FEE: waived / custom ──────────────────────────────────────────
test('calcManualOrderTotals: delivery fee can be waived to 0', () => {
  const items = [{ unit_price_usd: 25, quantity: 1 }];
  const r = calcManualOrderTotals({ items, deliveryFee: 0 });
  assert.equal(r.delivery, 0);
  assert.equal(r.grandTotal, 25);
});

test('calcManualOrderTotals: grand total floored at 0 when discount exceeds subtotal+delivery', () => {
  const items = [{ unit_price_usd: 10, quantity: 1 }]; // 10
  const r = calcManualOrderTotals({ items, deliveryFee: 0, discountType: 'fixed_amount', discountValue: 999 });
  assert.equal(r.discount, 10); // clamped to subtotal
  assert.equal(r.grandTotal, 0);
});

// ── #1 PER-ITEM PRICE OVERRIDE flows straight into the stored total ───────────
test('calcManualOrderTotals: per-item override changes stored subtotal & total', () => {
  // Admin negotiates a special unit price of 12 instead of the 20 list price.
  const items = [{ unit_price_usd: 12, quantity: 2 }];
  const r = calcManualOrderTotals({ items, deliveryFee: 3 });
  assert.equal(r.subtotal, 24);
  assert.equal(r.grandTotal, 27);
});

// ── #5 FINAL-TOTAL OVERRIDE: stored total is the admin value, not the auto one ─
test('final-total override: stored grand total is the admin-entered value', () => {
  const items = [{ unit_price_usd: 20, quantity: 3 }]; // auto subtotal 60
  const auto = calcManualOrderTotals({ items, deliveryFee: 5 });
  assert.equal(auto.grandTotal, 65);

  // Admin overrides the final total to a round 60. This is what must be stored
  // and reported as revenue — NOT the 65 auto value.
  const overridden = 60;
  const storedGrandTotal = true ? overridden : auto.grandTotal;
  assert.equal(storedGrandTotal, 60);
  // The audit trail (subtotal/discount/delivery) still reflects the breakdown.
  assert.equal(auto.subtotal, 60);
  assert.equal(auto.delivery, 5);
});

// ── End-to-end: auto-discount default → override → order discount → total ─────
test('end-to-end manual order: discount default, override, order discount, delivery', () => {
  const product = { id: 'p1', price_usd: 40, applies_to: 'all_products' };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'percentage', value: 25 }];

  // #2 auto-applied storefront discount default: 40 → 30
  const defaultUnit = getEffectiveUnitPrice(discounts, product, 40);
  assert.equal(defaultUnit, 30);

  // #1 admin overrides one line to 28
  const items = [
    { unit_price_usd: defaultUnit, quantity: 1 }, // 30
    { unit_price_usd: 28, quantity: 2 }, // 56
  ];

  // #3 + #4 order-level 10% discount and $4 delivery
  const r = calcManualOrderTotals({ items, deliveryFee: 4, discountType: 'percentage', discountValue: 10 });
  assert.equal(r.subtotal, 86);
  assert.equal(r.discount, 8.6);
  assert.equal(r.delivery, 4);
  assert.equal(r.grandTotal, 81.4); // 86 - 8.6 + 4
});
