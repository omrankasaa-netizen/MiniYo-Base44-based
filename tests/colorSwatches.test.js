// Unit tests for src/lib/colorSwatches.js — the pure helpers that turn messy
// variant color labels into card swatches (hex tones + per-color stock).
//
//   Run: npm test   (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeColorLabel,
  tonesForLabel,
  buildColorSwatches,
} from '../src/lib/colorSwatches.js';

test('normalizeColorLabel: strips supplier codes and style markers', () => {
  assert.equal(normalizeColorLabel('Beige (MND1842)'), 'beige');
  assert.equal(normalizeColorLabel('Grey Melange (MND2764)'), 'grey melange');
  assert.equal(normalizeColorLabel('Style2:green'), 'green');
  assert.equal(normalizeColorLabel('Style 1119'), '');
});

test('normalizeColorLabel: collapses separator and case variants', () => {
  assert.equal(normalizeColorLabel('Sage Green'), normalizeColorLabel('Sage-Green'));
  assert.equal(
    normalizeColorLabel('Pink&Powder-Pink Set'),
    normalizeColorLabel('Pink&Powder-Pink set'),
  );
  assert.equal(normalizeColorLabel('blue'), normalizeColorLabel('Blue'));
});

test('normalizeColorLabel: keeps shade words distinct', () => {
  assert.notEqual(normalizeColorLabel('Light Blue'), normalizeColorLabel('Blue'));
});

test('tonesForLabel: simple color names resolve', () => {
  assert.deepEqual(tonesForLabel('Pink'), ['#f2b3c6']);
  assert.deepEqual(tonesForLabel('Black'), ['#2b2b2b']);
  assert.deepEqual(tonesForLabel('White'), ['#ffffff']);
});

test('tonesForLabel: print names starting with a color use that color', () => {
  assert.deepEqual(tonesForLabel('Pink Floral'), ['#f2b3c6']);
  assert.deepEqual(tonesForLabel('White Star'), ['#ffffff']);
  assert.deepEqual(tonesForLabel('Beige Butterfly'), ['#d9c7a9']);
});

test('tonesForLabel: combo labels produce two tones', () => {
  assert.deepEqual(tonesForLabel('White&Navy'), ['#ffffff', '#2e3a55']);
  assert.deepEqual(tonesForLabel('Green & Navy'), ['#7da97d', '#2e3a55']);
  assert.deepEqual(tonesForLabel('cream&brown'), ['#f2e9d5', '#8a6844']);
  assert.deepEqual(tonesForLabel('Powder Pink & Ecru'), ['#f5d2d9', '#e7dcc6']);
});

test('tonesForLabel: multi-word tones beat single-word matches', () => {
  assert.deepEqual(tonesForLabel('Powder Pink'), ['#f5d2d9']);
  assert.deepEqual(tonesForLabel('Sage Green'), ['#b5c2ab']);
  assert.deepEqual(tonesForLabel('Light Blue'), ['#a9c6e2']);
  assert.deepEqual(tonesForLabel('Grey Melange (MND2764)'), ['#a9a9a9']);
});

test('tonesForLabel: supplier Burgandy spelling resolves to burgundy', () => {
  assert.deepEqual(tonesForLabel('Burgandy'), tonesForLabel('Burgundy'));
  assert.deepEqual(tonesForLabel('Burgandy'), ['#6f2e37']);
});

test('tonesForLabel: pure print names return no tones', () => {
  assert.deepEqual(tonesForLabel('Dino'), []);
  assert.deepEqual(tonesForLabel('Giraffe Set'), []);
  assert.deepEqual(tonesForLabel('Bunny'), []);
});

test('buildColorSwatches: dedupes case/separator variants, keeps first label', () => {
  const product = { has_variants: true };
  const variants = [
    { color: 'Sage Green', qty_on_hand: 2, qty_reserved: 0 },
    { color: 'Sage-Green', qty_on_hand: 1, qty_reserved: 0 },
    { color: 'Pink&Powder-Pink Set', qty_on_hand: 3, qty_reserved: 0 },
    { color: 'Pink&Powder-Pink set', qty_on_hand: 0, qty_reserved: 0 },
  ];
  const swatches = buildColorSwatches(product, variants);
  assert.equal(swatches.length, 2);
  assert.equal(swatches[0].label, 'Sage Green');
  assert.equal(swatches[1].label, 'Pink&Powder-Pink Set');
  assert.deepEqual(swatches[1].hexes, ['#f2b3c6', '#f5d2d9']);
  assert.ok(swatches.every((s) => s.inStock));
});

test('buildColorSwatches: per-color stock sums across sizes and respects reservations', () => {
  const product = { has_variants: true };
  const variants = [
    { color: 'Pink', size: '0-3m', qty_on_hand: 0, qty_reserved: 0 },
    { color: 'Pink', size: '3-6m', qty_on_hand: 5, qty_reserved: 5 },
    { color: 'Mint', size: '0-3m', qty_on_hand: 4, qty_reserved: 1 },
  ];
  const swatches = buildColorSwatches(product, variants);
  assert.equal(swatches.length, 2);
  const pink = swatches.find((s) => s.key === 'pink');
  const mint = swatches.find((s) => s.key === 'mint');
  assert.equal(pink.inStock, false); // 0 on hand + fully reserved
  assert.equal(mint.inStock, true);
});

test('buildColorSwatches: falls back to product.colors pipe string without variants', () => {
  const swatches = buildColorSwatches({ colors: 'Pink | Mint | White' }, []);
  assert.equal(swatches.length, 3);
  assert.deepEqual(swatches.map((s) => s.label), ['Pink', 'Mint', 'White']);
  assert.ok(swatches.every((s) => s.inStock && s.hexes.length === 1));
});

test('buildColorSwatches: empty inputs yield no swatches', () => {
  assert.deepEqual(buildColorSwatches(null, []), []);
  assert.deepEqual(buildColorSwatches({}, []), []);
  assert.deepEqual(buildColorSwatches({ colors: '' }, []), []);
  assert.deepEqual(buildColorSwatches({ has_variants: true }, [{ color: '  ' }]), []);
});

test('buildColorSwatches carries the first variant image_url per color', () => {
  const product = { id: 'p1', has_variants: true };
  const variants = [
    { color: 'Pink', size: '0-3M', qty_on_hand: 2, qty_reserved: 0 },
    { color: 'Pink', size: '3-6M', qty_on_hand: 1, qty_reserved: 0, image_url: 'https://img/pink.webp' },
    { color: 'Pink', size: '6-9M', qty_on_hand: 1, qty_reserved: 0, image_url: 'https://img/pink-2.webp' },
    { color: 'Navy', size: '0-3M', qty_on_hand: 1, qty_reserved: 0, image_url: '  ' },
  ];
  const swatches = buildColorSwatches(product, variants);
  assert.equal(swatches[0].image, 'https://img/pink.webp'); // first non-empty wins
  assert.equal(swatches[1].image, null); // blank/whitespace URLs are ignored
});

test('buildColorSwatches image dedupe: color variants with codes share the image', () => {
  const product = { id: 'p1', has_variants: true };
  const variants = [
    { color: 'Beige (MND1842)', qty_on_hand: 0, qty_reserved: 0 },
    { color: 'Beige', qty_on_hand: 3, qty_reserved: 0, image_url: '/uploads/beige.webp' },
  ];
  const swatches = buildColorSwatches(product, variants);
  assert.equal(swatches.length, 1);
  assert.equal(swatches[0].image, '/uploads/beige.webp');
  assert.equal(swatches[0].inStock, true);
});

test('buildColorSwatches pipe-string fallback has no image', () => {
  const swatches = buildColorSwatches({ colors: 'Red|Blue' }, []);
  assert.deepEqual(swatches.map((s) => s.image), [null, null]);
});
