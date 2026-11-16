// Unit tests for the "Build a gift box" recommendation logic (src/lib/giftBuilder.js).
// Pure functions — no DB, no network.  Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSizeMonths, sizeFitsAge, genderFits, stepFor, buildRecommendations, selectionTotal, diversify,
} from '../src/lib/giftBuilder.js';

test('parseSizeMonths handles month ranges, missing M, years and one size', () => {
  assert.deepEqual(parseSizeMonths('3-6M'), [3, 6]);
  assert.deepEqual(parseSizeMonths('3-6'), [3, 6]);
  assert.deepEqual(parseSizeMonths(' 12-18 M '), [12, 18]);
  assert.deepEqual(parseSizeMonths('2Y'), [24, 36]);
  assert.deepEqual(parseSizeMonths('2-3Y'), [24, 36]);
  assert.equal(parseSizeMonths('One size'), 'any');
  assert.equal(parseSizeMonths(''), 'any');
  assert.equal(parseSizeMonths('XL'), null);
});

test('sizeFitsAge uses the middle of the age range', () => {
  assert.equal(sizeFitsAge('1-3M', '0-3M'), true);
  assert.equal(sizeFitsAge('0-6M', '0-3M'), true);
  assert.equal(sizeFitsAge('0-6M', '3-6M'), true);
  assert.equal(sizeFitsAge('0-6M', '6-9M'), false);
  assert.equal(sizeFitsAge('6-12M', '9-12M'), true);
  assert.equal(sizeFitsAge('12-24M', '18-24M'), true);
  assert.equal(sizeFitsAge('0-1M', '0-3M'), false);
  assert.equal(sizeFitsAge('One size', '12-18M'), true);
  assert.equal(sizeFitsAge('XL', '0-3M'), false);
});

test('genderFits: girl/boy include unisex, "not sure" is unisex only', () => {
  assert.equal(genderFits('Girls', 'girl'), true);
  assert.equal(genderFits('Unisex', 'girl'), true);
  assert.equal(genderFits('Boys', 'girl'), false);
  assert.equal(genderFits('Girls', 'boy'), false);
  assert.equal(genderFits('', 'any'), true);
  assert.equal(genderFits('Girls', 'any'), false);
});

test('stepFor maps categories and falls back to name hints only without a category', () => {
  assert.equal(stepFor({ name: 'x' }, 'rompers'), 'outfit');
  assert.equal(stepFor({ name: 'x' }, 'blankets'), 'cozy');
  assert.equal(stepFor({ name: 'x' }, 'socks'), 'extras');
  assert.equal(stepFor({ name: 'Romper' }, 'swimwear'), null);
  assert.equal(stepFor({ name: 'Pink Floral Quilted Baby Bonnet' }, ''), 'extras');
});

const cats = { c1: 'rompers', c2: 'blankets', c3: 'socks', c4: 'gift-sets', c5: 'swimwear' };
const products = [
  { id: 'romper', name: 'Romper', category_id: 'c1', gender: 'Girls', has_variants: true, price_usd: 20, status: 'Active' },
  { id: 'romperBoy', name: 'Boy romper', category_id: 'c1', gender: 'Boys', has_variants: true, price_usd: 18, status: 'Active' },
  { id: 'blanket', name: 'Blanket', category_id: 'c2', gender: 'Unisex', has_variants: true, price_usd: 24, status: 'Active' },
  { id: 'socks', name: 'Socks', category_id: 'c3', gender: 'Unisex', has_variants: true, price_usd: 4, status: 'Active' },
  { id: 'swim', name: 'Swim romper', category_id: 'c5', gender: 'Girls', has_variants: true, price_usd: 15, status: 'Active' },
  { id: 'giftset', name: 'Gift set', category_id: 'c4', gender: 'Girls', has_variants: true, price_usd: 35, status: 'Active' },
  { id: 'bundle', name: 'Box', is_bundle: true, stock_quantity: 1, gender: 'Girls', price_usd: 47, status: 'Active',
    bundle_items: [{ product_id: 'romper', size: '3-6M' }, { product_id: 'socks', size: '0-6M' }] },
  { id: 'bundleSold', name: 'Sold box', is_bundle: true, stock_quantity: 0, gender: 'Girls', price_usd: 41, status: 'Active',
    bundle_items: [{ product_id: 'romper', size: '3-6M' }] },
];
const variants = [
  { id: 'v1', product_id: 'romper', size: '3-6M', color: 'Pink', qty_on_hand: 1 },
  { id: 'v2', product_id: 'romper', size: '9-12M', color: 'Pink', qty_on_hand: 1 },
  { id: 'v3', product_id: 'romperBoy', size: '3-6M', color: 'Blue', qty_on_hand: 1 },
  { id: 'v4', product_id: 'blanket', size: 'One size', color: 'Pink', qty_on_hand: 2, qty_reserved: 2 },
  { id: 'v5', product_id: 'blanket', size: 'One size', color: 'Blue', qty_on_hand: 1 },
  { id: 'v6', product_id: 'socks', size: '0-6M', color: 'Pink', qty_on_hand: 3 },
  { id: 'v7', product_id: 'swim', size: '3-6M', color: 'Pink', qty_on_hand: 3 },
  { id: 'v8', product_id: 'giftset', size: '3-6M', color: 'Pink', qty_on_hand: 1 },
];

test('buildRecommendations groups in-stock pieces of the right size by step', () => {
  const { ready, steps } = buildRecommendations(products, variants, cats, { age: '3-6M', gender: 'girl' });
  assert.deepEqual(steps.outfit.map((x) => x.product.id), ['romper']);
  assert.deepEqual(steps.outfit[0].options.map((v) => v.id), ['v1']);
  assert.deepEqual(steps.cozy.map((x) => x.product.id), ['blanket']);
  assert.deepEqual(steps.cozy[0].options.map((v) => v.id), ['v5'], 'reserved colour hidden');
  assert.deepEqual(steps.extras.map((x) => x.product.id), ['socks']);
  assert.deepEqual(ready.map((p) => p.id), ['bundle', 'giftset'], 'bundles first, sold-out bundle hidden, swimwear skipped');
});

test('buildRecommendations: wrong size or gender drops items; no age → nothing', () => {
  const r = buildRecommendations(products, variants, cats, { age: '0-3M', gender: 'boy' });
  assert.equal(r.steps.outfit.length, 0);
  assert.equal(r.ready.length, 0);
  assert.deepEqual(buildRecommendations(products, variants, cats, {}).steps.outfit, []);
});

test('selectionTotal sums variant or product prices', () => {
  assert.equal(selectionTotal([{ product: { price_usd: 20 } }, { product: { price_usd: 4 }, variant: { price_usd: 5 } }]), 25);
});

test('a bundle only counts for an age when every sized piece fits', () => {
  const box = { id: 'b', is_bundle: true, stock_quantity: 1, gender: 'Girls', status: 'Active', price_usd: 47,
    bundle_items: [{ size: '3-6M' }, { size: '0-6M' }, { size: 'One size' }] };
  assert.equal(buildRecommendations([box], [], {}, { age: '3-6M', gender: 'girl' }).ready.length, 1);
  assert.equal(buildRecommendations([box], [], {}, { age: '0-3M', gender: 'girl' }).ready.length, 0);
});

test('diversify interleaves categories and keeps order within each', () => {
  const e = (id, group) => ({ id, group });
  const out = diversify([e('s1', 'socks'), e('s2', 'socks'), e('s3', 'socks'), e('h1', 'hats'), e('t1', 'tights')]);
  assert.deepEqual(out.map((x) => x.id), ['s1', 'h1', 't1', 's2', 's3']);
});
