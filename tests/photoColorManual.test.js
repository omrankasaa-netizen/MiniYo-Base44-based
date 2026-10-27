import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { photoColorAssign } from '../server/photoColorAssign.js';
import {
  initSchema, createRecord, getRecord, deleteRecord,
} from '../server/db.js';

initSchema();

function fixture(t) {
  const id = randomUUID();
  const productId = `manual-product-${id}`;
  const pinkId = `manual-pink-${id}`;
  const blushId = `manual-blush-${id}`;
  const otherId = `manual-other-${id}`;
  const otherProductId = `other-${id}`;
  const imageA = `https://img.test/${id}/pink.jpg`;
  const imageB = `https://img.test/${id}/blush.jpg`;
  createRecord('Product', { id: productId, name: 'Manual color test', status: 'Active', has_variants: true });
  createRecord('ProductImage', { id: `image-a-${id}`, product_id: productId, url: imageA, image_url: imageA });
  createRecord('ProductImage', { id: `image-b-${id}`, product_id: productId, url: imageB, image_url: imageB });
  createRecord('ProductVariant', { id: pinkId, product_id: productId, color: 'Pink', size: '1-2Y', image_url: imageA });
  createRecord('ProductVariant', { id: blushId, product_id: productId, color: 'Blush', size: '1-2Y', image_url: imageB });
  createRecord('Product', { id: otherProductId, name: 'Other product', status: 'Active', has_variants: true });
  createRecord('ProductVariant', { id: otherId, product_id: otherProductId, color: 'Pink', size: '1-2Y', image_url: imageA });
  t.after(() => {
    for (const variantId of [pinkId, blushId, otherId]) deleteRecord('ProductVariant', variantId);
    for (const imageId of [`image-a-${id}`, `image-b-${id}`]) deleteRecord('ProductImage', imageId);
    deleteRecord('Product', productId);
    deleteRecord('Product', otherProductId);
  });
  return { productId, pinkId, blushId, otherId, otherProductId, imageA, imageB };
}

test('manual assignments can swap existing AI photo colors', async (t) => {
  const f = fixture(t);
  const result = await photoColorAssign({ apply: true, manual: true, assignments: [
    { productId: f.productId, imageUrl: f.imageA, colorKey: 'blush' },
    { productId: f.productId, imageUrl: f.imageB, colorKey: 'pink' },
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 0);
  assert.equal(getRecord('ProductVariant', f.pinkId).image_url, f.imageB);
  assert.equal(getRecord('ProductVariant', f.blushId).image_url, f.imageA);
});

test('manual Unassigned clears only the selected product photo', async (t) => {
  const f = fixture(t);
  const result = await photoColorAssign({ apply: true, manual: true, assignments: [
    { productId: f.productId, imageUrl: f.imageA, colorKey: '' },
  ] });
  assert.equal(result.variantsCleared, 1);
  assert.equal(getRecord('ProductVariant', f.pinkId).image_url, null);
  assert.equal(getRecord('ProductVariant', f.blushId).image_url, f.imageB);
  assert.equal(getRecord('ProductVariant', f.otherId).image_url, f.imageA);
});

test('manual writes reject cross-product photos and unknown color keys', async (t) => {
  const f = fixture(t);
  const result = await photoColorAssign({ apply: true, manual: true, assignments: [
    { productId: f.otherProductId, imageUrl: f.imageA, colorKey: 'pink' },
    { productId: f.productId, imageUrl: f.imageA, colorKey: 'invented' },
    { productId: f.productId, imageUrl: 'https://img.test/not-owned.jpg', colorKey: 'pink' },
  ] });
  assert.equal(result.skipped, 3);
  assert.equal(getRecord('ProductVariant', f.pinkId).image_url, f.imageA);
  assert.equal(getRecord('ProductVariant', f.blushId).image_url, f.imageB);
});

test('AI apply still refuses to overwrite an existing assignment', async (t) => {
  const f = fixture(t);
  const result = await photoColorAssign({ apply: true, assignments: [
    { productId: f.productId, imageUrl: f.imageB, colorKey: 'pink' },
  ] });
  assert.equal(result.skipped, 1);
  assert.equal(getRecord('ProductVariant', f.pinkId).image_url, f.imageA);
});
