// Unit tests for src/lib/bulkEdit.js — the pure helpers behind the admin
// Products page "Bulk edit" panel (category/gender/age/badges/tags applied to
// many products at once).
//
//   Run: npm test   (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTags,
  serializeTags,
  addTag,
  removeTag,
  buildBulkUpdate,
} from '../src/lib/bulkEdit.js';

test('parseTags: trims, drops empties, preserves order', () => {
  assert.deepEqual(parseTags('summer, baby ,,gift'), ['summer', 'baby', 'gift']);
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(null), []);
});

test('serializeTags: canonical comma-space form', () => {
  assert.equal(serializeTags(['a', 'b']), 'a, b');
});

test('addTag: appends, dedupes case-insensitively, no-op on empty', () => {
  assert.equal(addTag('summer, gift', 'autumn'), 'summer, gift, autumn');
  assert.equal(addTag('summer, Gift', 'gift'), 'summer, Gift'); // already present
  assert.equal(addTag('summer', '  '), 'summer');
  assert.equal(addTag('', 'summer'), 'summer');
});

test('removeTag: removes all case-insensitive occurrences', () => {
  assert.equal(removeTag('summer, Summer, gift', 'SUMMER'), 'gift');
  assert.equal(removeTag('gift', 'summer'), 'gift'); // absent: unchanged
  assert.equal(removeTag('gift', ''), 'gift');
});

test('buildBulkUpdate: empty form changes nothing → null (skip write)', () => {
  const form = { category_id: '', gender: '', age_group: '', is_new: '', is_featured: '', add_tag: '', remove_tag: '' };
  assert.equal(buildBulkUpdate(form, { tags: 'summer' }), null);
});

test('buildBulkUpdate: scalar fields pass through only when set', () => {
  const form = { category_id: 'cat-9', gender: 'Girls', age_group: '', is_new: '', is_featured: '', add_tag: '', remove_tag: '' };
  assert.deepEqual(buildBulkUpdate(form, {}), { category_id: 'cat-9', gender: 'Girls' });
});

test('buildBulkUpdate: tri-state badges map yes/no to true/false', () => {
  const base = { category_id: '', gender: '', age_group: '', add_tag: '', remove_tag: '' };
  assert.deepEqual(buildBulkUpdate({ ...base, is_new: 'yes', is_featured: '' }, {}), { is_new: true });
  assert.deepEqual(buildBulkUpdate({ ...base, is_new: '', is_featured: 'no' }, {}), { is_featured: false });
});

test('buildBulkUpdate: tag add/remove merges against CURRENT product tags', () => {
  const form = { category_id: '', gender: '', age_group: '', is_new: '', is_featured: '', add_tag: 'winter', remove_tag: 'summer' };
  assert.deepEqual(
    buildBulkUpdate(form, { tags: 'summer, gift' }),
    { tags: 'gift, winter' },
  );
});

test('buildBulkUpdate: tag already correct → null (no useless write)', () => {
  const form = { category_id: '', gender: '', age_group: '', is_new: '', is_featured: '', add_tag: 'summer', remove_tag: '' };
  assert.equal(buildBulkUpdate(form, { tags: 'gift, Summer' }), null);
});

test('buildBulkUpdate: add + remove same tag → remove wins, no change → null', () => {
  // Remove-first semantics: removing a tag then re-adding the same tag nets to
  // the tag being present — but if it was already present, nothing changed.
  const form = { category_id: '', gender: '', age_group: '', is_new: '', is_featured: '', add_tag: 'summer', remove_tag: 'summer' };
  assert.equal(buildBulkUpdate(form, { tags: 'summer' }), null);
  // …but on a product missing the tag, it ends up added.
  assert.deepEqual(buildBulkUpdate(form, { tags: 'gift' }), { tags: 'gift, summer' });
});
